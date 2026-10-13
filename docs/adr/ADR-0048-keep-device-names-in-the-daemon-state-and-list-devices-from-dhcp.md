# ADR-0048. Build the LAN device list from DHCP on every request, and keep custom names in the daemon state

- Status: Accepted
- Date: 2026-10-09
- Deciders: repository owner

## Context and problem statement

US-12 of the [PRD](../PRD.md): see network devices by names from DHCP or set by the owner, and pick them in rules instead of IPs. The requirements are in the "Devices" section: AC-58 (a list from dnsmasq leases and static entries), AC-59 (a custom name by MAC survives a daemon restart, label priority), AC-60 (one label across the whole panel), AC-62 (a rule condition by device is written as `source_ip_cidr`).

What the device and the code provide:

- dnsmasq leases are in the file `/tmp/dhcp.leases` as lines `<expiry> <mac> <ip> <name|*> <client-id|*>`; dnsmasq changes the file on every lease it hands out.
- Static leases are `host` sections in the `dhcp` UCI (`name`, `ip`, `mac` as a list or space-separated); the owner edits them through LuCI or SSH.
- Neither of these sources stores the name the owner gave a device in the panel, and sing-box does not know device names at all: a routing rule compares the source address.
- The daemon's service directory (`state_dir`, `/etc/metabox` by default) already holds the Apply transaction state, the version history and the rule set catalog; writes to it are atomic through `config.Store`.

Open questions of the decision: where and how often the daemon gets the list, where custom names live, who computes the label. In scope: the sources, name storage, the `GET /api/devices` and `PUT /api/devices/{mac}` contract, the label in the panel. Out of scope: the "through sing-box" toggle on the "Devices" screen (AC-61, waits for AC-53) and the dataplane ACL ([ADR-0047](./ADR-0047-set-up-lan-interception-in-the-singbox-init-script.md)).

## Decision drivers

1. **Do not touch other configs**: the router's DHCP and the sing-box config do not change because the owner labelled a device.
2. **Freshness**: a lease handed out a minute ago and a static entry added over SSH are visible without a daemon restart.
3. **Persistence**: a custom name survives a daemon restart and a router reboot and is the same in any browser (AC-59).
4. **One label**: the priority is computed in one place, all screens show the same thing (AC-60).
5. **Cost on the router**: no background polling without a consumer, no new dependency.

## Considered options

1. **Custom names as `host` sections in the `dhcp` UCI.** The name is visible to both LuCI and dnsmasq, no separate storage. But a `host` section is a DHCP server setting, not a label: renaming would change the router's DHCP config, which the panel does not own (driver 1); for the same reason the dnsmasq upstream in AC-50 and OQ-19 is put as a conf-dir fragment, and the `dhcp` UCI is not edited. **Rejected.**
2. **Custom names in the sing-box config.** The config is the only source of truth about routing, and [ADR-0033](./ADR-0033-keep-custom-rule-lists-in-the-singbox-config.md) keeps custom lists in it exactly because they change routing. A device name does not change routing: a rule by device is written as an address (AC-62), and the name is panel data, not core data. Renaming would go through the Apply protocol (check, sing-box restart, confirmation window) for the sake of a label in a table (drivers 1 and 5). **Rejected.**
3. **Custom names in the browser.** Neither the daemon nor a file is needed. But the names live in one browser and disappear with its data, while AC-59 requires storage in the daemon (driver 3). **Rejected.**
4. **The list from leases and `uci show dhcp` on every request, custom names in a `devices.json` file in the daemon's service directory, keyed by MAC.** **Chosen.**

## Decision outcome

**List.** On every request `GET /api/devices` reads the lease file (the `-dhcp-leases` flag, at most 1 MiB) and `uci -q show dhcp`, merges them by lowercase MAC and adds the custom names. The daemon does not cache the list. A device with a custom name and no lease stays in the list, offline and, if there is no static entry, without an address: a rule for it must not disappear while the device is not on the network. The address is taken from the lease, without one from the static entry. `Online` means the lease has not expired by the router clock or has no expiry.

**Label.** The daemon returns the winner in `name` and its source in `name_source`: the custom name (`custom`), then the static lease name (`static`), then the name the device reported in DHCP (`dhcp`), otherwise `none`. The panel adds only the fallback levels (the IP, and the MAC for a device without an address) in `toDeviceLabel`, and turns a connection's source address into a label with one function, `deviceLabel`, in [`Device.model.ts`](../../apps/web/src/entities/Device/model/Device.model.ts). The places where it is used are listed by the `Device.places` test.

**Storage.** Custom names are a "MAC → name" object in `<state_dir>/devices.json`. The daemon reads it once on start and keeps it in memory; `PUT /api/devices/{mac}` writes the file atomically through `config.Store` before updating memory and responds with the whole list. An empty name removes the custom one. Limits: 64 characters per name without control characters, 1024 names, 4 KiB per request body. A broken file on start: the device endpoints are not registered, the panel labels sources with addresses, and the file is not overwritten by the next edit.

**Request cost in the panel.** Each `GET` runs `uci` on the router, so the panel keeps the list fresh for a minute (`staleTime`), polls it once a minute with one consumer per screen, and stops polling on a failure ([`Device.query.ts`](../../apps/web/src/entities/Device/api/Device.query.ts)).

Non-goal: names are not part of the config draft or the Apply protocol: they have no `ETag`, `If-Match` or confirmation window; edits of different MACs from two tabs do not lose each other, for edits of one MAC the last one wins. IPv6 leases (lines with a DUID) are skipped.

### Scope and boundaries

`apps/metaboxd/internal/devices`, `ReadDevices`/`WriteDevices` in `internal/config`, the device endpoints in `internal/httpapi`, `contract.Devices`; the panel: `apps/web/src/entities/Device`.

## Consequences

### Positive

- The router's DHCP and the sing-box config do not change on renaming; after the panel is removed one extra file remains in the service directory.
- A new lease and a static entry added over SSH are visible on the next poll, without a daemon restart and without a file watcher.
- One label for the whole panel: the priority is in the daemon, the fallback levels are in one function.
- Renaming is instant: no sing-box restart and no confirmation window.

### Negative

- `uci show dhcp` runs on every `GET /api/devices`: the cost relies on the panel's discipline, not on a daemon cache.
- Names are bound to the MAC: a device with a random MAC (a private Wi-Fi address) gets a new orphan name when the address changes, and old entries accumulate up to the 1024 limit.
- Names do not get into the version history and are not rolled back together with the config.
- A rule by device stores the address: with a dynamic lease it may stop matching the device, and the panel only warns (AC-62).

### Neutral or deferred

- A list cache in the daemon and watching the lease file are not done until a measurement shows the cost of polling.
- Names of devices that have not appeared on the network for a long time are not cleaned up.

## Risks and mitigations

| Risk                                                                                                                        | Probability and impact                                              | Mitigation                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Load from `uci` on every request: several tabs or a third-party client poll the endpoint often                              | Low, low: extra processes on the router                             | The panel polls once a minute per screen; nothing limits a third-party client                      |
| `uci show dhcp` output larger than 64 KiB, the command output limit: static entries from the tail are lost without an error | Low on a home network, medium: some devices without static names    | Not detected; if `dhcp` grows, read the UCI file directly or raise the limit for this call         |
| The router clock is in the past before NTP sync: an expired lease counts as live                                            | Medium after a reboot, low: a wrong "online" flag                   | The flag is described in the `Device.Online` contract; it does not affect the label or the address |
| A broken `devices.json` after power loss                                                                                    | Low, the write is atomic; medium: the devices screen is unavailable | The daemon starts without the device endpoints and logs an error; the file is not overwritten      |

## Compatibility, migration and rollback

No migration is needed: no file means no custom names, and the list is built from DHCP. The contract is extended with the `GET /api/devices` and `PUT /api/devices/{mac}` endpoints; a daemon without these endpoints refuses them, and the panel shows a list loading error and labels sources with addresses.

Rollback: delete `<state_dir>/devices.json`; labels return to static leases and DHCP.

## Validation

- `cd apps/metaboxd && go test ./internal/devices/ ./internal/httpapi/`: parsing leases and `uci show dhcp` on router fixtures, merging by MAC, label priority, offline by an expired lease, a device with only a custom name, refusing a long name and control characters, a write failure does not change memory, a broken file is a start error. The 1024-name limit is not covered by a test.
- `pnpm -C apps/web exec vitest run Device`: `toDeviceLabel`, `deviceLabel`, the label places in `Device.places`, the "Devices" screen.
- On the test bench or the router: `curl http://<panel>/api/devices`, then `PUT` a custom name, restart `metaboxd`: the name is in place, and `cat <state_dir>/devices.json` contains the MAC in lowercase.

## Links

- [PRD](../PRD.md): US-12, AC-58…AC-62, AC-50 and OQ-19 (the `dhcp` UCI is not edited);
- [ADR-0033](./ADR-0033-keep-custom-rule-lists-in-the-singbox-config.md): custom lists in the sing-box config, not in the daemon state;
- [ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md): the Apply protocol, which names bypass;
- [ADR-0047](./ADR-0047-set-up-lan-interception-in-the-singbox-init-script.md): the dataplane ACL, where the AC-61 toggle writes;
- [`devices.go`](../../apps/metaboxd/internal/devices/devices.go), [`dhcp.go`](../../apps/metaboxd/internal/devices/dhcp.go), [`config.go`](../../apps/metaboxd/internal/config/config.go), [`httpapi.go`](../../apps/metaboxd/internal/httpapi/httpapi.go);
- [`Device.model.ts`](../../apps/web/src/entities/Device/model/Device.model.ts), [`Device.query.ts`](../../apps/web/src/entities/Device/api/Device.query.ts).
