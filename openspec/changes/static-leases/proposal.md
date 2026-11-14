## Why

A rule by device needs a stable address; today the lease is pinned in LuCI.

Issue: none yet.

## What Changes

The daemon reads static leases and the panel shows them; nothing writes them. To build:

- Daemon: read the `host` sections of UCI `dhcp` with their section names and the `tag` option (today only name, address and MACs are parsed); a fingerprint of the `dhcp` config for the concurrent-edit check.
- Daemon: create, change and remove one `host` section by MAC with `uci batch` and `commit dhcp`, restart dnsmasq exactly once, restore the section when the write or the restart fails. Refuse a section with several MACs and a MAC that appears in two sections.
- Daemon: HTTP endpoints for the three operations with error codes for "several MACs", "duplicate MAC", "changed underneath" and "restart failed, restored".
- Panel: a lease form on the "Devices" screen (name, address, tag), the three actions, the refusal texts that send the user to LuCI.
- Panel: the dynamic-lease warning of AC-62 disappears after pinning without a reload (device list refetch).
- Bench: a check on a real dnsmasq that the lease is handed out after the restart.

## Capabilities

### Modified Capabilities

- `devices`: AC-80.

## Impact

- `apps/metaboxd/internal/devices` (read and write of `host` sections), `apps/metaboxd/internal/uci`, `apps/metaboxd/internal/httpapi`, `apps/metaboxd/internal/contract`, `apps/metaboxd/internal/locale`.
- `apps/web/src/entities/Device`, a new feature under `apps/web/src/features/Device`, `apps/web/src/pages/Devices`.
- `.devcontainer` bench script; `docs/Verification.md`; `apps/web/src/shared/api/daemon.generated.ts` through `make schema-daemon`.

## Already built

Reading only:

- `staticHosts` and `parseHosts` in `apps/metaboxd/internal/devices/dhcp.go` read `uci -q show dhcp` and take name, address and MACs of every `host` section, a MAC list included. The section name and `tag` are not read.
- `Device.Static` in `apps/metaboxd/internal/devices/devices.go` and `GET /api/devices`; test `TestListMergesLeasesAndStaticHosts` in `devices_test.go`.
- The "Devices" screen shows static or dynamic per device: `apps/web/src/pages/Devices/ui/DevicesLease.tsx`.
- The AC-62 warning already depends on `static`: `apps/web/src/features/Rule/RuleEdit/model/RuleEdit.model.ts`. It will disappear for a pinned device as soon as the device list is refetched.
- A pattern to reuse for the write: snapshot, fingerprint, one `uci batch`, read-back, restore in `apps/metaboxd/internal/dataplane/write.go` (`Snapshot`, `Sum`, `Write`, `Restore`), tests in `write_test.go`.

Not built: any write to UCI `dhcp`, any dnsmasq restart by the daemon, the lease form.

## Out of scope

- DHCP pools, dnsmasq options, IPv6 and `odhcpd`: stay in LuCI (PRD section 8, Non-Goals).
- The own device name of the panel (`PUT /api/devices/{mac}`): a separate store, not the `host` name.
- AC-88, the address of an excluded device under a static lease: it reads the lease, this change does not alter it.
- What the tag is used for in dnsmasq (`dhcp-option` by tag): the tag is written, options are not edited.

## Open questions

- No issue names this work; open one when it is scheduled.
- The owner has not approved this proposal: it carries a criterion that was not marked as done when the criteria moved out of the product document.
- [ADR-0048](../../../docs/adr/ADR-0048-keep-device-names-in-the-daemon-state-and-list-devices-from-dhcp.md) rejected writing to UCI `dhcp`: the panel does not own the DHCP config. This change needs a new ADR that supersedes that part before the design is written.
- "Restart dnsmasq": `/etc/init.d/dnsmasq restart` drops DNS for the LAN for a moment; `reload` also rereads `host` sections on OpenWrt. Is a reload acceptable, or is the word "restart" binding? AC-50 says "restarted ... exactly once per change".
- How is a failed restart detected: the exit code of the init script, or dnsmasq answering on port 53 afterwards?
- "Concurrent edit is detected": by a fingerprint of the whole `dhcp` config taken when the panel read it, or of the `host` sections only? A whole-config fingerprint refuses a save after an unrelated LuCI edit.
- Uncommitted changes of `dhcp` staged by LuCI (`/tmp/.uci`): `commit dhcp` from the daemon would commit them too. Refuse the save while such changes exist?
- Which address may be pinned: any IPv4 inside the LAN subnet, or also outside the DHCP pool? Is an address already held by another lease refused?
- The name: is the `host` name a DNS name with its restrictions, and does it replace the panel's own device name or live next to it?
