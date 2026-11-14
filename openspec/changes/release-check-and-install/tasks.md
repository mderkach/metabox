## 1. Decisions

- [ ] 1.1 AC-81, AC-82: write `design.md` and the decision records for the source of the latest versions, the source of the core hash, and the self-update of the `metaboxd` package, after the owner answers the open questions. Verified by `make trace-check`.
- [ ] 1.2 AC-81, AC-82: add a `## Design brief` for the update block of "Settings" with `/impeccable shape`. Verified by manual: the owner approves the brief.

## 2. Release check (AC-81)

- [x] 2.1 AC-81: installed versions of `metaboxd` and the core are in the status and on the "Settings" screen (`contract.Status`, `apps/web/src/pages/Settings/ui/SettingsSystem.tsx`). No test asserts the two rows; task 2.5 adds it with the "latest" column. Verified by manual: open "Settings", section "System".
- [ ] 2.2 AC-81: daemon checker of `metaboxd` and core releases: once a day and on request, state saved between restarts, off until turned on. Verified by `make test`: no request is sent while the check is off.
- [ ] 2.3 AC-81: route of the request, direct or through the selected node, as a stored setting. Verified by `make test`.
- [ ] 2.4 AC-81: endpoints for the state, the switch, the route and "check now"; regenerate types with `make schema-daemon`; messages in English and Russian. Verified by `make test`.
- [ ] 2.5 AC-81: "Settings" shows installed and latest side by side, the switch, the route and "check now". Verified by `pnpm --filter web test`, `pnpm --filter web check:design` and an independent Impeccable critique.
- [ ] 2.6 AC-81: add the rows of 2.2-2.5 to `docs/Verification.md`. Verified by `make trace-check`.

## 3. Install (AC-82)

- [ ] 3.1 AC-82: download to a temporary directory, never to the overlay; hash check of the core package. Verified by `make test`: a wrong hash stops the install before `apk`.
- [ ] 3.2 AC-82: core install as an Apply transaction: backup of the previous binary, install, restart, healthcheck, confirmation window, rollback, replay on daemon start (`apps/metaboxd/internal/apply`). Verified by `make test`.
- [ ] 3.3 AC-82: bench scenario: a core that fails the healthcheck is rolled back to the previous binary. Verified by a bench script in `.devcontainer`.
- [ ] 3.4 AC-82: `metaboxd` install from the project feed, surviving the restart of the daemon that started it. Verified by a bench script in `.devcontainer`.
- [ ] 3.5 AC-82: panel: install actions, confirmation window for the core, progress and failure texts. Verified by `pnpm --filter web test`, `pnpm --filter web check:design` and an independent Impeccable critique.
- [ ] 3.6 AC-82: the panel keeps the session and the open screen across the daemon restart and picks up the new assets. Verified by `pnpm --filter web test:e2e`.
- [ ] 3.7 AC-82: add the rows of 3.1-3.6 to `docs/Verification.md`. Verified by `make trace-check`.

## 4. Documentation

- [ ] 4.1 AC-81, AC-82: describe the check and the install in the user documentation, English and Russian; update the "Updates" lines of `install.sh` and README in both languages; update the derived Russian translation of the spec. Verified by manual: read the pages against the built screen.
