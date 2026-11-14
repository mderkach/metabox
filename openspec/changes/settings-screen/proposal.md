## Why

Password, MCP access and system state need one place in the panel instead of the sidebar footer and SSH.

Issue: #235.

## What Changes

- Add the dataplane settings to the system section of "Settings": the last clause of AC-77 that is not built. Today the section only links to the "Devices" screen.
- Decide which fields of the UCI section `metabox.dataplane` the block shows and edits (see open questions), and write a design brief for the block before the work.
- Save from the block through the existing `PUT /api/dataplane` and its confirmation window (AC-53); no new daemon endpoint is expected.
- Add the missing AC-77 rows to `docs/Verification.md`: there is no row for "each section is reachable and complete on its own" beyond the page test, and none for the new block.

## Capabilities

### New Capabilities

- `settings`: AC-77.

## Impact

- `apps/web/src/pages/Settings` (`SettingsSystem.tsx`), a new slice under `apps/web/src/features` for the dataplane form, `apps/web/src/entities/Dataplane`, i18n dictionaries en and ru.
- `apps/metaboxd`: none expected; `internal/dataplane` and `internal/httpapi/dataplane.go` already read and write the whole model.
- `docs/Verification.md`, user documentation en and ru.

## Already built

Everything in AC-77 except the dataplane settings on the screen.

- Navigation entry and one screen with three sections: `apps/web/src/pages/Settings/ui/SettingsPage.tsx`; vitest `shows access, agents and system as sections of one screen` (`pages/Settings/__tests__/SettingsPage.test.tsx`).
- Sidebar footer without password and MCP buttons: vitest `leads to the settings screen instead of keeping password and MCP buttons in the footer` (`widgets/AppSidebar/__tests__/AppSidebar.test.tsx`).
- Access: password form `features/Auth/AuthPassword` (`AuthPassword.test.tsx`); session list `features/Auth/AuthSessions`, `GET /api/auth/sessions` and `DELETE /api/auth/sessions/{id}` in `apps/metaboxd/internal/httpapi/httpapi.go`. Tests: `TestSessionsListTheCallerFirstWithoutTokens` (`internal/auth/auth_test.go`); `TestEndingAnotherSessionClosesItsStreams`, `TestTheCurrentSessionIsNotEndedFromTheList`, `TestEndingASessionLogsWhoEndedWhichSession`, `TestSessionListWithoutPasswordIsEmpty`, `TestEndingASessionWithoutPasswordIsNotFound`, `TestEndSessionWhoseWriteFailsIsAnError` (`internal/httpapi/auth_test.go`); vitest in `AuthSessions/__tests__/AuthSessions.test.tsx`; e2e `ends another panel session from the settings screen` (`apps/web/e2e/settingsSessions.e2e.test.ts`). All are rows of `docs/Verification.md`.
- Agents: `features/Mcp/McpAccess` (enable, token, regenerate, disable), tests in `McpAccess/__tests__/McpAccess.test.tsx`, rows under AC-71.
- System: `pages/Settings/ui/SettingsSystem.tsx` shows the service control (`widgets/Daemon/DaemonService`), the panel, core and schema versions and the config path, and a link to "Devices".
- Dataplane model in the panel and the daemon: `apps/web/src/entities/Dataplane` reads every field; `GET` and `PUT /api/dataplane` with the confirmation window exist. Only device sources and subnets are edited, on "Devices" (`features/Device/DeviceRoute`).

## Out of scope

- The first-run wizard that walks the same sections: AC-78 and AC-79, change `first-run-wizard`, issue #236.
- Per-device interception and subnets: AC-49 and the subnet requirement in `openspec/specs/devices`; they stay on "Devices".
- Release check and installing a release from the panel: AC-81 and AC-82, change `release-check-and-install`.
- HTTPS and the operator language as settings on the screen: AC-74 and AC-75 keep them in UCI.
- Changing how the dataplane is applied: AC-51 to AC-54 in `openspec/specs/dataplane`.

## Open questions

- The owner has not approved this proposal: it carries a criterion that was not marked as done when the criteria moved out of the product document.
- Which fields count as "dataplane settings" on this screen? The model has: enabled, ACL mode, redirect, tproxy and DNS ports, DNS interception, the bypass and tproxy marks, the route table, LAN interfaces, and the source and exclusion lists. Issue #235 leaves the split between "Settings" and "Devices" undecided.
- The ports and the bypass mark must match the inbounds and `route.default_mark` of the sing-box config. Does the block edit them, show them read-only, or edit them together with the config in one apply?
- Is the block a form or a read-only summary with the interception switch? A wrong port or interface cuts the LAN off until the confirmation window rolls back.
- On a platform without a dataplane the daemon serves no `/api/dataplane`. Is the block hidden or shown as unavailable?
