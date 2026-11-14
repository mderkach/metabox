## 1. Built parts

- [x] 1.1 AC-77: "Settings" entry and a screen with access, agents and system sections. Built: `apps/web/src/pages/Settings`; vitest `shows access, agents and system as sections of one screen`. Verify: `pnpm --filter web test`.
- [x] 1.2 AC-77: password, sessions and ending a session. Built: `features/Auth/AuthPassword`, `features/Auth/AuthSessions`, `internal/httpapi/auth.go`; the AC-77 rows of `docs/Verification.md`. Verify: `make test`, `pnpm --filter web test`, `pnpm --filter web test:e2e`.
- [x] 1.3 AC-77: MCP access in the agents section. Built: `features/Mcp/McpAccess`. Verify: `pnpm --filter web test`.
- [x] 1.4 AC-77: versions and service state in the system section; the footer keeps theme, language, logout and service state. Built: `SettingsSystem.tsx`; vitest `leads to the settings screen instead of keeping password and MCP buttons in the footer`. Verify: `pnpm --filter web test`.

## 2. Design

- [ ] 2.1 AC-77: answer the open questions of the proposal with the owner: the field list, form or summary, behaviour without a dataplane. Verify: manual: the proposal has no open question left.
- [ ] 2.2 AC-77: write `design.md` with a `## Design brief` for the dataplane block made with `/impeccable shape`: the user question, the content, the states (loading, not applied, no dataplane, apply in progress, rejected). Verify: manual: the owner approves the brief.

## 3. Panel

- [ ] 3.1 AC-77: add the dataplane block to the system section, reading `entities/Dataplane`. Verify: `pnpm --filter web test`, `pnpm --filter web check:design`, an Impeccable critique by someone who did not write it.
- [ ] 3.2 AC-77: save the agreed fields through `PUT /api/dataplane` with `If-Match` and the confirmation window, reusing the flow of `features/Device/DeviceRoute`; show a rejected change and a reread model. Verify: `pnpm --filter web test`, `pnpm --filter web check:design`, an Impeccable critique by someone who did not write it.
- [ ] 3.3 AC-77: texts in the en and ru dictionaries of the slice. Verify: `pnpm --filter web test`.
- [ ] 3.4 AC-77: add rows to `docs/Verification.md` for the block (vitest for the states, one e2e on mocks that changes a setting and confirms it). Verify: `make trace-check`, `pnpm --filter web test:e2e`.
- [ ] 3.5 AC-77: check on the router. Verify: manual: on the test bench change one dataplane setting from "Settings", let the window expire once and confirm once; the UCI section follows the result both times.

## 4. User documentation

- [ ] 4.1 AC-77: describe the dataplane block in `README.md` and `README.ru.md` where the interception setup over UCI is described, and update the derived Russian translation of the `settings` spec. Verify: manual: read both files.
- [ ] 4.2 AC-77: remove "Not done: the dataplane settings" from the requirement text only by an explicit edit of the spec in this change, approved by the owner. Verify: `pnpm --silent openspec validate settings-screen --no-interactive`.
