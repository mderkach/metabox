## 1. Daemon: read

- [x] 1.1 AC-80: `host` sections of UCI `dhcp` are read with name, address and MACs, and a device carries `static` (`apps/metaboxd/internal/devices/dhcp.go`, `devices.go`). Verified by `make test`: `TestListMergesLeasesAndStaticHosts`.
- [ ] 1.2 AC-80: read the section name and the `tag` option of a `host` section; mark a section with several MACs and a MAC found in two sections as not editable in `GET /api/devices`. Verified by `make test`.
- [ ] 1.3 AC-80: fingerprint of UCI `dhcp` returned with the device list, for the concurrent-edit check. Verified by `make test`.

## 2. Daemon: write

- [ ] 2.1 AC-80: create, change and remove one `host` section by MAC (name, address, MAC, tag) with one `uci batch` and `commit dhcp`, then read back; pools, dnsmasq options and IPv6 sections stay byte for byte. Verified by `make test`.
- [ ] 2.2 AC-80: refuse a section with several MACs and a duplicate MAC; refuse a save whose fingerprint does not match the current `dhcp`. Verified by `make test`.
- [ ] 2.3 AC-80, AC-50: restart dnsmasq exactly once per saved lease; restore the previous section when the write or the restart fails, and restart again after the restore. Verified by `make test` with a fake runner.
- [ ] 2.4 AC-80: HTTP endpoints for the three operations, error codes in `apps/metaboxd/internal/contract`, messages in English and Russian (`apps/metaboxd/internal/locale`); regenerate the panel types with `make schema-daemon`. Verified by `make test`.
- [ ] 2.5 AC-80: bench script on real dnsmasq: pin, the lease is handed out, break the restart, the section is back. Verified by the bench script in `.devcontainer`.
- [ ] 2.6 AC-80: add the rows of tasks 1.2-2.5 to `docs/Verification.md`. Verified by `make trace-check`.

## 3. Panel

- [ ] 3.1 AC-80: lease form on the "Devices" screen: pin, change, unpin for one MAC; name, address and tag with validation. Verified by `pnpm --filter web test`, `pnpm --filter web check:design` and an independent Impeccable critique.
- [ ] 3.2 AC-80: refusals shown in place: several MACs and duplicate MAC point to LuCI, a concurrent edit offers to reread, a failed restart says the section was restored. Verified by `pnpm --filter web test`, `pnpm --filter web check:design` and an independent Impeccable critique.
- [ ] 3.3 AC-80, AC-62: after pinning, the device list is refetched and the dynamic-lease warning in the rule form is gone. Verified by `pnpm --filter web test`.
- [ ] 3.4 AC-80: add the panel rows to `docs/Verification.md`. Verified by `make trace-check`.

## 4. Documentation

- [ ] 4.1 AC-80: describe pinning an address from "Devices" in the user documentation, English and Russian, and update the derived Russian translation of the spec. Verified by manual: read both pages against the built screen.
