# ADR-0047. Set up LAN traffic interception in the sing-box service init script from the UCI model

- Status: Accepted
- Date: 2026-10-09
- Deciders: repository owner
- Superseded by (as to the DNS probe of the healthcheck): [ADR-0061](./ADR-0061-skip-the-dns-check-when-dns-already-failed-before-the-restart.md) (Proposed)

## Context and problem statement

On the router, routing is owned by another package: its service runs sing-box and sets up nft rules, `ip rule` and the dnsmasq upstream. US-11 of the [PRD](../PRD.md) requires metabox to own interception, DNS and the sing-box service itself, rather than keep a second package next to it that competes for the same nft and dnsmasq rules. The dataplane requirements are AC-48…AC-57 of the "Dataplane" section: the `redirect_tproxy` mode, the `all`/`listed` ACL by IP and MAC, the dnsmasq upstream as a conf-dir fragment without editing the `dhcp` UCI (OQ-19), fail-closed (OQ-16), coexistence with other daemons that mark router traffic.

The open question of this decision is who sets up the dataplane on the device and how. Constraints already set by the code and other decisions:

- The sing-box service is managed only by the init script through procd ([ADR-0009](./ADR-0009-read-service-state-from-procd.md), [DeviceIO](../../apps/metaboxd/docs/guides/DeviceIO.md)), the service is part of the panel package ([ADR-0011](./ADR-0011-ship-the-daemon-as-an-apk-package.md)), and the daemon checks the candidate with the command procd uses to run the service ([ADR-0046](./ADR-0046-check-the-candidate-the-way-the-service-runs.md)).
- The firewall is owned by fw4: its `reload` rebuilds the `inet fw4` table entirely, and foreign rules live in it only through an include.
- The Apply protocol ([ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md)) restarts the service and must not reload fw4 or restart dnsmasq (AC-50).
- The daemon starts after the sing-box service and may be down while the service runs (AC-48, AC-51).

In scope: where the dataplane model lives, which process sets up and removes the rules, how the daemon learns that they are in place, and what happens to interception when sing-box restarts or crashes. Out of scope: writing the model from the panel and the confirmation window for it (AC-53), the "Devices" screen (AC-61), the order of switching the router over from the previous routing package (AC-67), IPv6.

## Decision drivers

1. **Replacement, not coexistence**: one owner of the nft rules, `ip rule` and dnsmasq on the router (US-11).
2. **Independence from the daemon**: the dataplane is set up on boot and removed by `stop` without a live metaboxd (AC-51).
3. **Fail-closed**: while sing-box is starting or down, the traffic of listed devices and the network's DNS do not bypass the proxy (AC-52).
4. **Apply does not touch the network**: a sing-box restart does not reload fw4 and does not restart dnsmasq (AC-50).
5. **Compatibility with other daemons that mark router traffic**: traffic that already carries another daemon's mark bypasses interception (AC-57).
6. **Verifiability**: the test bench and the healthcheck show whether the dataplane is in place.

## Considered options

1. **Keep the data plane of the previous routing package, metabox is only a config editor.** Nothing to rewrite: interception, DNS and the service stay with that package, and the daemon works with its paths, which the comment in [`metabox`](../../apps/metaboxd/package/etc/config/metabox) allows. But the rules, the service command and the process are owned by another package: its dataplane does not know about the metabox model, and it sets the service command, not the `metabox` UCI. This is exactly the two-package situation US-11 moves away from (driver 1); the owner rejected coexistence. **Rejected.**
2. **A `tun` inbound with sing-box `auto_redirect`.** sing-box sets up the rules itself, there is no separate dataplane. But sing-box tun selects traffic by destination, interface and uid, not by source address, so the `listed` ACL by IP and MAC from AC-49 cannot be expressed on it; `auto_redirect` marks packets itself and conflicts with `route.default_mark`, on which loop avoidance relies; unlisted devices would go through userspace (drivers 1 and 5). **Rejected.**
3. **The daemon sets up the dataplane.** The daemon reads the model anyway, so it is easier for it to reconcile it with the kernel and report errors to the panel. But then the dataplane lives only while the daemon is alive: on boot there is no interception before it starts, and nobody can remove it while the daemon is dead (driver 2). A daemon crash either leaves the rules without an owner or, if the daemon removes them on exit, opens traffic directly (driver 3). **Rejected.**
4. **The sing-box service init script sets up the dataplane from the UCI model, the daemon reads it.** The rules live as long as the service: procd brings them up on boot, `stop` removes them. The model is UCI, which both the script and the daemon read. The cost is about 350 lines of shell with nft rendering and state reconciliation, not covered by unit tests and checked only on the test bench. **Chosen.**

## Decision outcome

The dataplane is set up and removed by the init script [`metabox-singbox`](../../apps/metaboxd/package/etc/init.d/metabox-singbox) from the model in the `metabox.dataplane` section. The daemon reads the model and changes it only through a transaction with a confirmation window: a snapshot of the previous section, a `uci batch` write with reconciliation, a service `reload`, a check of the chains and dns-in, the window, rollback to the snapshot without confirmation; the transaction state lives in `dataplane.json` of the service directory, and Replay on start completes the rollback ([`internal/apply/plane.go`](../../apps/metaboxd/internal/apply/plane.go), [`internal/dataplane/write.go`](../../apps/metaboxd/internal/dataplane/write.go)).

**Model.** A section of type `dataplane` named `dataplane` in `/etc/config/metabox`: `enabled`, ports `redirect_port`/`tproxy_port`/`dns_port`, `dns_hijack`, marks `self_mark`/`tproxy_mark`, `route_table`, `acl_mode` (`all` | `listed`), lists `source_ip`, `source_mac`, `lan_interface`, `wan_proxy_cidr`, `wan_direct_cidr`, `ipv6`. Without the section or an option the defaults apply (5331/5332/5333, marks 100 and 101, table 100, `listed`, `br-lan`, the dataplane enabled), the same in the script and in `dataplane.Defaults()`. An invalid model does not change the dataplane already in place.

**What `start` sets up with `enabled=1`:**

- the fragment `/var/run/metabox/fw4_post.nft` and the include `firewall.metabox_post` (`type nftables`, `position table-append`): sets and chains prefixed with `metabox_` inside `table inet fw4`, and jumps at the end of `dstnat`, `mangle_prerouting`, `mangle_output`. TCP is redirected to `redirect_port`, UDP goes to tproxy on `tproxy_port` with the `tproxy_mark` mark, udp/53 from `lan_interface` is redirected to dnsmasq with `dns_hijack=1`. Before `fw4 reload` the fragment goes through `fw4 check`; on failure the previous one stays;
- `ip rule fwmark <tproxy_mark> table <route_table>` and `local 0.0.0.0/0 dev lo` in that table;
- the fragment `metabox.conf` (`no-resolv`, `no-poll`, `server=127.0.0.1#<dns_port>`) in the conf-dir of the first dnsmasq instance; the `dhcp` UCI is not edited.

Each step is reconciled with what is already in place and touches nothing on a match. A packet with `self_mark` and a router packet with any other non-zero mark bypass interception.

**Lifecycle.**

- `restart` and `reload` are overridden: they remove only the `sing-box` instance from procd and call `start`. The dataplane stays in place while sing-box is starting (fail-closed). A model change in UCI reaches the rules through `reload` by the procd trigger on the `metabox` config.
- `stop` removes the dataplane using the values from `/var/run/metabox/dataplane.state` (mark, table, dnsmasq fragment path), not from UCI, which may have been changed by that time. `metabox_*` chains and sets left empty after `fw4 reload` are deleted separately. After `stop`, `nft list ruleset` and `ip rule` show no traces of metabox.
- `enabled=0` on `start` removes the dataplane the same way as `stop`.

**Daemon.** The `apps/metaboxd/internal/dataplane` package reads the model with `uci -q show metabox` and the applied state, the `metabox_*` chains in `inet fw4`, from `nft -j list chains`. The names of the section, options and chains are a contract with the script (`ExpectedChains`). The post-restart healthcheck ([`cycle.go`](../../apps/metaboxd/internal/apply/cycle.go)), using the model taken before the restart, checks that the chains present before the restart have not disappeared (`interception_missing`), and sends a DNS probe to dns-in on `dns_port` (`dns_probe_failed`).

Non-goal: IPv6 chains, a fail-open mode for the duration of a restart (item 8 of the PRD roadmap).

### Scope and boundaries

`apps/metaboxd/package/etc/init.d/metabox-singbox`, the `dataplane` section in `apps/metaboxd/package/etc/config/metabox`, `apps/metaboxd/internal/dataplane`, the dataplane checks in `internal/apply/cycle.go`, `GET /api/dataplane`, the test bench: `make dataplane-check`.

## Consequences

### Positive

- The dataplane survives a reboot and a daemon crash: it needs only procd.
- A config Apply restarts one sing-box process: fw4 and dnsmasq are not touched as long as the model has not changed.
- There is no window between sing-box and the rules in which traffic or DNS would go directly.
- The model is visible and edited in one place, UCI; the panel and SSH see the same thing.
- The healthcheck catches a config after which interception disappeared or dns-in does not answer, not only a live Clash API.

### Negative

- The dataplane logic is shell in an init script without unit tests; nft rendering errors are caught only by the test bench.
- The naming contract (section, options, `metabox_*` chains, defaults) is duplicated in shell and in Go; a mismatch is not caught by the tests of one side.
- Fail-closed: while sing-box is down, connections of listed devices are refused, and the whole network's DNS gets no answer.
- A change of model rules means `fw4 reload`; dnsmasq restarts only when the fragment changes (`dns_port`), an ACL change does not touch it; on boot dnsmasq starts twice.
- The script's `restart` and `reload` do not behave as in `rc.common`, and this has to be remembered when working with the service by hand.

### Neutral or deferred

- The "let traffic through directly while the core is starting" mode is deferred as a second path in the init script (item 8 of the PRD roadmap).
- An ACL change through the daemon restarts sing-box and drops connections; rollback drops them a second time. A `dns_port` change restarts dnsmasq on the change and on rollback.

## Risks and mitigations

| Risk                                                                                                                                                                                                 | Probability and impact                                                     | Mitigation                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Double interception next to another routing service: on an already installed package `/etc/config/metabox` is not overwritten, and without the `dataplane` section the defaults with `enabled` apply | Medium on a package update on the router, high: a network without internet | The package section is disabled; before installation the section is added by hand or the service is disabled                                       |
| A window without DNS during a sing-box restart: dnsmasq forwards queries to dns-in, which does not exist yet                                                                                         | High on every Apply, low: seconds without an answer                        | Accepted as the price of fail-closed (AC-52); the healthcheck does not count a restart without a dns-in answer                                     |
| Stale set elements: `flush table` in `fw4 reload` does not touch elements, so a removed source would stay in `metabox_src_*`                                                                         | Low, medium: a device removed from the ACL goes through sing-box           | After its own `fw4 reload` the script reloads the sets in one nft transaction; a reload failure is written to the log                              |
| No `dnsmasq` section in `/etc/config/dhcp`: the script sets up nft and ip rule but does not put the upstream fragment, and intercepted DNS goes to the regular dnsmasq upstream                      | Low on OpenWrt with dnsmasq, high: DNS bypasses sing-box                   | The failure is written to `logread` with the `metabox-singbox` tag; the healthcheck DNS probe goes to dns-in directly and does not catch this case |
| Hooks of a real traffic-marking daemon at the same `mangle` priority behave differently from their emulation on the test bench                                                                       | Unknown, high: the marked flow goes to tproxy                              | AC-57 stays open until it is checked on the router in the first day after the switch                                                               |

## Compatibility, migration and rollback

The package is installed while the previous routing service is running: the `dataplane` section in the package file is disabled, and the `metabox-singbox` service does not set up rules.

Dataplane rollback: `/etc/init.d/metabox-singbox stop` or `enabled '0'` with `reload`: the dataplane is removed without traces, after which the previous routing service can be brought up.

## Validation

- `make dataplane-check` on the test bench: the dataplane is set up by the service start; TCP of clients from `source_ip` and `source_mac` goes to redirect, of an unlisted one it bypasses; UDP goes to tproxy; udp/53 goes through dnsmasq to dns-in; router traffic and a packet with a foreign mark; Apply does not change the fw4 rules or the dnsmasq pid; a killed sing-box leaves interception in place; the `all` mode; `stop` removes everything, `start` returns it; a disabled model does not remove foreign `ip rule` entries or a table with the dataplane numbers.
- `make apply-check`: the service is run by the `sing-box` instance with a single `-c`, the Apply cycle passes; step 10 of `dataplane-check` runs it with the dataplane in place.
- `cd apps/metaboxd && go test ./internal/dataplane/ ./internal/apply/`: parsing the model and defaults, chains from `nft -j list chains`, the `interception_missing` and `dns_probe_failed` refusals.
- On the device after `stop`: `nft list ruleset | grep metabox_` and `ip rule | grep 'lookup <route_table>'` are empty, `uci -q get firewall.metabox_post` returns nothing.

## Links

- [PRD](../PRD.md): US-11, AC-48…AC-57, AC-67, OQ-16, OQ-19, item 8 of the roadmap after v1;
- [ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md), [ADR-0009](./ADR-0009-read-service-state-from-procd.md), [ADR-0011](./ADR-0011-ship-the-daemon-as-an-apk-package.md), [ADR-0023](./ADR-0023-build-the-bench-from-the-device-firmware.md), [ADR-0046](./ADR-0046-check-the-candidate-the-way-the-service-runs.md);
- [DeviceIO](../../apps/metaboxd/docs/guides/DeviceIO.md), sections "Service through procd" and "Dataplane";
- [`metabox-singbox`](../../apps/metaboxd/package/etc/init.d/metabox-singbox), [`metabox`](../../apps/metaboxd/package/etc/config/metabox), [`dataplane.go`](../../apps/metaboxd/internal/dataplane/dataplane.go), [`cycle.go`](../../apps/metaboxd/internal/apply/cycle.go);
- [`dataplane-check.sh`](../../.devcontainer/dataplane-check.sh), [`dataplane-check`](../../.devcontainer/target/files/usr/bin/dataplane-check).
