## 1. Decisions

- [ ] 1.1 AC-78, AC-79: answer the open questions of the proposal with the owner. Verify: manual: the proposal has no open question left.
- [ ] 1.2 AC-78, AC-79: write `design.md` with a `## Design brief` made with `/impeccable shape` (steps, skip, banner, states of each step) and the decision record for the flag, the starter config and the detection of another service (the `create-adr` skill). Verify: manual: the owner approves the brief; `make trace-check`.

## 2. Daemon

- [ ] 2.1 AC-78: keep the "first run finished" flag in the state directory, serve it and set it over the API, set it at start when a config already exists. Add the rows to `docs/Verification.md`. Verify: `make test`, `make trace-check`.
- [ ] 2.2 AC-78: report whether the core binary is installed, next to its version. Add the rows. Verify: `make test`.
- [ ] 2.3 AC-78: build the starter config: dataplane inbounds on the ports of `metabox.dataplane`, `route.default_mark` equal to the bypass mark, `experimental.clash_api`; it passes `sing-box check` and goes through the apply protocol. Add the rows. Verify: `make test`.
- [ ] 2.4 AC-79: report whether the platform has a dataplane and whether another service is running sing-box. Add the rows. Verify: `make test`.
- [ ] 2.5 AC-79: on a platform without a dataplane refuse to remove the password. Add the rows. Verify: `make test`.
- [ ] 2.6 AC-78, AC-79: regenerate the panel contract. Verify: `make schema-daemon`, `make test`.
- [x] 2.7 AC-78: `experimental.clash_api` is added to a config that lacks it. Built: `clashapi.Ensure` in `internal/apply/apply.go`. Verify: `make test`.
- [x] 2.8 AC-79: ACL mode and sources are changed through the confirmation window. Built: `PUT /api/dataplane` in `internal/httpapi/dataplane.go`, `internal/dataplane`. Verify: `make test`.

## 3. Panel

- [ ] 3.1 AC-78: wizard page with the steps core, password, MCP access, devices, first config; each step reuses the "Settings" section and can be skipped. Add the rows. Verify: `pnpm --filter web test`, `pnpm --filter web check:design`, an Impeccable critique by someone who did not write it.
- [ ] 3.2 AC-78: banner that offers to continue while the flag is not set, and an entry in "Settings" that reopens the wizard; the panel stays usable. Add the rows. Verify: `pnpm --filter web test`, `pnpm --filter web check:design`, an Impeccable critique by someone who did not write it.
- [ ] 3.3 AC-79: devices step: tick devices, ACL mode `listed`, `all` as a separate deliberate choice, the AC-53 confirmation window; a warning and no switch when another service runs sing-box. Add the rows. Verify: `pnpm --filter web test`, `pnpm --filter web check:design`, an Impeccable critique by someone who did not write it.
- [ ] 3.4 AC-79: without a dataplane the devices step is absent and the password step has no skip. Add the rows. Verify: `pnpm --filter web test`.
- [ ] 3.5 AC-78: first-config step applies the starter config through the existing apply flow and shows a rollback. Add the rows. Verify: `pnpm --filter web test`.
- [ ] 3.6 AC-78, AC-79: texts in en and ru dictionaries; mock handlers for the new endpoints; one e2e on mocks that walks the wizard with a skipped step and one that leaves it unfinished and sees the banner. Add the rows. Verify: `pnpm --filter web test:e2e`, `make trace-check`.

## 4. Bench

- [ ] 4.1 AC-78, AC-79: clean install. Verify: manual: on the test bench run `install.sh` on a router without a config, walk the wizard, tick one device; routing works for that device and not for another, and the flag survives a daemon restart. Add the scenario as a `manual` row.
- [ ] 4.2 AC-78: upgrade. Verify: manual: on a router that already has a config install the new package; no banner appears.
- [ ] 4.3 AC-79: another service. Verify: manual: with another service running sing-box the devices step warns and the UCI section `metabox.dataplane` stays disabled.

## 5. User documentation

- [ ] 5.1 AC-78, AC-79: describe the first run in `README.md` and `README.ru.md`, update the closing message of `install.sh` in both languages, and update the derived Russian translation of the `setup` spec. Verify: manual: read both files; `make test` for the installer texts.
