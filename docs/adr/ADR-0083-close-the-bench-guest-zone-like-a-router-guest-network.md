# ADR-0083. Close the bench guest zone like a router guest network and let in only the listed services

- Status: Accepted
- Date: 2026-11-19
- Deciders: repository owner
- Supersedes (as to which part isolates the bench networks, the address the published port arrives at, and fw4 being deferred or disabled on the bench): [ADR-0023](./ADR-0023-build-the-bench-from-the-device-firmware.md)

## Context and problem statement

[ADR-0023](./ADR-0023-build-the-bench-from-the-device-firmware.md) built the test bench without the OpenWrt firewall (fw4): Docker isolated the external network, the port published to the host was expected at the wired network's address, and fw4 rules were deferred. Since then fw4 starts on the bench with the `lan`, `guest` and `wan` zones from [`.devcontainer/target/files/etc/config/firewall`](../../.devcontainer/target/files/etc/config/firewall), and `wan` is closed for input. ADR-0023 still describes the earlier state.

Docker Desktop 29 delivers the ports published to the host (8080 for the panel, 9090 for the Clash API, the sing-box control API) to the container's guest network address `192.168.220.2`, not to the wired one; `gw_priority` does not change that. A measurement on 2026-11-19 showed the host connecting to `192.168.220.2:9090` from `192.168.65.1`, an address of the Docker Desktop virtual machine outside the guest subnet `192.168.220.0/24`. To keep the published ports working, the guest zone was opened for input entirely. So the bench did not model a guest network closed to the router, and `make reach-check` could not catch a change that opens router services to guests.

In scope: the input policy of the bench guest zone, its explicit rules, and what `make reach-check` asserts. Out of scope: the firewall on the device (the panel package does not ship fw4 rules), DHCP on the bench (odhcpd does not start, dnsmasq runs without DHCP, Docker assigns the addresses).

## Decision drivers

1. **Match with the device**: the guest zone looks like a typical OpenWrt guest network, input `REJECT` with explicit rules.
2. **The published ports keep working** from the owner's machine: the panel on `localhost:8080` and the Clash API on `localhost:9090`, which [`docs/Development.md`](../Development.md) and the dev container promise.
3. **The check catches a regression**: `make reach-check` fails when the guest network reaches a router port that it should not.
4. **No platform tricks in the decision**: the rules do not name an address that belongs to one Docker installation.

## Considered options

1. **Keep the guest zone open for input.** Nothing changes, the published ports work. The bench does not model a guest network, and the check cannot see a service opened to guests (drivers 1, 3). **Rejected.**

2. **Input `REJECT` with rules for DHCP, DNS and the panel port only; stop publishing the Clash API to the host.** The closest to a router guest network. The Clash API on `localhost:9090` stops answering on Docker Desktop, and the dev container, the development guide and the manual check of the dev environment would change (driver 2). **Rejected** for now: it changes the owner's development environment, which is not this decision's to change.

3. **Input `REJECT` with rules for DHCP, DNS and the panel port, plus the Clash API port for sources outside the guest subnet.** Guest clients get the router closed except DHCP, DNS and the panel. Traffic from the host arrives through the guest interface from an address outside `192.168.220.0/24` and keeps reaching the Clash API. The rule names the guest subnet, not the Docker Desktop address (driver 4). The extra rule has no counterpart on a router. **Chosen.**

4. **Allow the Clash API from the Docker Desktop address `192.168.65.1` only.** As narrow as option 3, but the address belongs to Docker Desktop's virtual machine network and is configurable there (driver 4). **Rejected.**

## Decision outcome

The guest zone of the bench fw4 rejects input; it accepts only:

- `Allow-Guest-DHCP`: udp 67-68, IPv4. DHCP does not run on the bench, the rule keeps the zone as on a router;
- `Allow-Guest-DNS`: tcp and udp 53;
- `Allow-Guest-Panel`: tcp 8080, the panel port, which also serves the owner's browser through the published port;
- `Allow-Host-Clash-API`: tcp 9090 from sources outside `192.168.220.0/24`, so the published Clash API answers on the host and guest clients are rejected.

`make reach-check` asserts per network and port: from the wired network the panel and the Clash API answer; from the guest network the panel answers and the Clash API is refused; from the external network both are refused. The wired-network reply of the Clash API shows that a refusal elsewhere comes from the firewall, not from a stopped sing-box.

Isolation of the bench networks is now shared: Docker keeps the external network without a route to the others (`internal`), and fw4 closes input on `wan` and, except the listed services, on `guest`.

Deliberately deferred: checking DHCP and DNS on the guest network from a client, target file system behaviour on power loss, a SNAPSHOT image for `aarch64_cortex-a53` for CI.

### Scope and boundaries

[`.devcontainer/target/files/etc/config/firewall`](../../.devcontainer/target/files/etc/config/firewall), the comment on the networks in [`.devcontainer/docker-compose.yml`](../../.devcontainer/docker-compose.yml) and the `reach-check` target in [`Makefile`](../../Makefile). The daemon, the panel and the package do not change.

## Consequences

### Positive

- The bench guest network is closed to the router like a guest network on OpenWrt.
- A change that opens the Clash API to guests fails `make reach-check` locally and in the CI `integration` job.

### Negative

- `Allow-Host-Clash-API` exists only on the bench: it works around how Docker Desktop delivers published ports and has no counterpart on a router.
- On Linux Docker the host may reach the container from the bridge gateway, an address inside the guest subnet; if the published port lands on the guest address there, `localhost:9090` does not answer. CI does not use it: its checks call the Clash API from inside the container.
- Only the Clash API port is asserted closed; another router service opened to guests passes the check unless it is added to the list.

### Neutral or deferred

- The DHCP rule is inert on the bench and is not checked.

## Risks and mitigations

| Risk                                                                    | Likelihood and impact                            | Mitigation                                                                                       |
| ----------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Docker delivers the published port to another network or source address | medium, the panel or the Clash API does not open | the panel stays open on `lan` and `guest`; the Clash API rule is one entry in the bench firewall |
| A Docker Desktop address range falls inside `192.168.220.0/24`          | low, the Clash API does not answer on the host   | the bench subnets are fixed in compose and can be moved together with `stand-init`               |

## Compatibility, migration and rollback

`make up` rebuilds the target image with the new firewall file; the volume with the sing-box config is not affected. Rollback: set `option input 'ACCEPT'` on the guest zone and rebuild; `make reach-check` then fails on the guest Clash API line until its expectation is reverted too.

## Validation

- `make up` then `make reach-check`: the wired network gets replies on 8080 and 9090, the guest network on 8080 only, the external network on neither;
- `curl http://localhost:8080/healthz` and `curl http://localhost:9090/version` on the owner's machine answer;
- `fw4 check` inside the target container passes;
- the CI `integration` job, step "Reach check".

Governed files: [`.devcontainer/target/files/etc/config/firewall`](../../.devcontainer/target/files/etc/config/firewall), [`Makefile`](../../Makefile) (`reach-check`), [`.devcontainer/docker-compose.yml`](../../.devcontainer/docker-compose.yml).

## Links

- [ADR-0023](./ADR-0023-build-the-bench-from-the-device-firmware.md): the bench built from the device image;
- [ADR-0041](./ADR-0041-run-v1-without-authentication-behind-network-and-origin-checks.md): the panel behind network checks;
- [`access`](../../openspec/specs/access/spec.md): AC-18, the panel reachable from local networks only;
- [`dev-environment`](../../openspec/specs/dev-environment/spec.md): AC-20, the dev environment with the Clash API on 9090;
- [OpenWrt guest Wi-Fi guide](https://openwrt.org/docs/guide-user/network/wifi/guestwifi/configuration_webinterface): the guest zone with input `REJECT` and rules for DHCP and DNS;
- issue [#233](https://github.com/mderkach/metabox/issues/233).
