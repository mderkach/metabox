# Requirement checks

Which check confirms which requirement of the [PRD](./PRD.md): acceptance criteria (`AC-N`, section 5), non-functional requirements (`NFR-N`, section 6) and interface principles (`UX-N`, section 7). The links go from a requirement to its check; code does not name requirements or decisions. The decision behind this: [ADR-0076](./adr/ADR-0076-link-requirements-to-their-checks-not-code-to-documents.md).

`.github/scripts/trace-check.py` reads this table on pre-push and in CI (`make trace-check`). It fails when:

- a row names an ID the PRD does not define;
- the file of a row does not exist, or the named test, job or target is not in it;
- tracked code outside Markdown names a document: `ADR-NNNN`, a requirement ID, or the PRD itself.

It reports, without failing yet, the ticked criteria and NFRs that have no row, and the requirements checked only by hand.

## How to add a row

A criterion is ticked in the PRD in the same commit as its row here. A requirement can have several rows; a criterion that is not ticked yet can have rows for the part that is covered.

| Kind      | File                         | Check                                 | Runs                                          |
| --------- | ---------------------------- | ------------------------------------- | --------------------------------------------- |
| `go-test` | Go test file                 | function name, `TestX`                | `make test`, CI                               |
| `bench`   | Go test file                 | benchmark name, `BenchmarkX`          | by hand, `go test -bench`; fails no threshold |
| `vitest`  | test file                    | the test title or a part of it        | `pnpm --filter web test`, CI                  |
| `e2e`     | `apps/web/e2e/*.e2e.test.ts` | the scenario title or a part of it    | `pnpm --filter web test:e2e`, CI              |
| `script`  | shell script                 | a line the script prints at that step | where the script runs                         |
| `ci`      | workflow file                | job ID                                | CI                                            |
| `make`    | `Makefile`                   | target                                | by hand or from CI                            |
| `manual`  | empty                        | the scenario in words                 | by hand                                       |

File and Check are written in backticks, except a manual scenario.

## Checks

| ID    | Kind    | File                                                                                      | Check                                                                                    |
| ----- | ------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| AC-6  | vitest  | `apps/web/src/features/Config/ConfigNodeForm/__tests__/ConfigNodeForm.overrides.test.tsx` | `a node from the add form and the node form with a rule passes the config schema`        |
| AC-8  | script  | `.devcontainer/target/files/usr/bin/apply-cycle-check`                                    | `List as a file: local rule-set from rule-sets/`                                         |
| AC-17 | ci      | `.github/workflows/ci.yml`                                                                | `web`                                                                                    |
| AC-21 | script  | `.devcontainer/target/files/usr/bin/apply-cycle-check`                                    | `The Apply cycle passed completely`                                                      |
| AC-22 | ci      | `.github/workflows/ci.yml`                                                                | `integration`                                                                            |
| AC-47 | vitest  | `apps/web/src/features/Config/ConfigNodeAdd/__tests__/ConfigNodeAdd.model.test.ts`        | `marks a type whose tag is not in the build, and does not mark a type without a gate`    |
| AC-86 | vitest  | `apps/web/src/features/Config/ConfigApply/__tests__/ConfigApplyDiff.test.tsx`             | `names a rename alone as one change that leads to the rule`                              |
| AC-86 | e2e     | `apps/web/e2e/applySummary.e2e.test.ts`                                                   | `a rename alone is one summary item that leads back to the rule`                         |
| AC-77 | vitest  | `apps/web/src/pages/Settings/__tests__/SettingsPage.test.tsx`                             | `shows access, agents and system as sections of one screen`                              |
| AC-77 | vitest  | `apps/web/src/widgets/AppSidebar/__tests__/AppSidebar.test.tsx`                           | `leads to the settings screen instead of keeping password and MCP buttons in the footer` |
| AC-77 | go-test | `apps/metaboxd/internal/auth/auth_test.go`                                                | `TestSessionsListTheCallerFirstWithoutTokens`                                            |
| AC-77 | vitest  | `apps/web/src/features/Auth/AuthSessions/__tests__/AuthSessions.test.tsx`                 | `lists this browser first, without an end button, and the others with one`               |
| AC-77 | go-test | `apps/metaboxd/internal/httpapi/auth_test.go`                                             | `TestEndingAnotherSessionClosesItsStreams`                                               |
| AC-77 | go-test | `apps/metaboxd/internal/httpapi/auth_test.go`                                             | `TestTheCurrentSessionIsNotEndedFromTheList`                                             |
| AC-77 | e2e     | `apps/web/e2e/settingsSessions.e2e.test.ts`                                               | `ends another panel session from the settings screen`                                    |
| AC-77 | go-test | `apps/metaboxd/internal/httpapi/auth_test.go`                                             | `TestEndingASessionLogsWhoEndedWhichSession`                                             |
| AC-77 | go-test | `apps/metaboxd/internal/httpapi/auth_test.go`                                             | `TestSessionListWithoutPasswordIsEmpty`                                                  |
| AC-77 | go-test | `apps/metaboxd/internal/httpapi/auth_test.go`                                             | `TestEndingASessionWithoutPasswordIsNotFound`                                            |
| AC-77 | go-test | `apps/metaboxd/internal/httpapi/auth_test.go`                                             | `TestEndSessionWhoseWriteFailsIsAnError`                                                 |
| AC-77 | vitest  | `apps/web/src/features/Auth/AuthSessions/__tests__/AuthSessions.test.tsx`                 | `says an unsaved end is still an end, without a failure toast`                           |
| AC-77 | vitest  | `apps/web/src/features/Auth/AuthSessions/__tests__/AuthSessions.test.tsx`                 | `tells the user to change the password when a session is unfamiliar`                     |
| AC-90 | vitest  | `apps/web/src/shared/lib/__tests__/shortcuts.test.tsx`                                    | `? opens the shortcut list and does not take the search behind the same key`             |
| AC-90 | vitest  | `apps/web/src/pages/Section/__tests__/SectionPage.test.tsx`                               | `the arrow keys move between node rows and Enter opens the row in focus`                 |
| AC-90 | vitest  | `apps/web/src/pages/Editor/__tests__/EditorPage.test.tsx`                                 | `the arrow keys move between rule rows and Enter opens the rule in focus`                |
| AC-90 | e2e     | `apps/web/e2e/keyboard.e2e.test.ts`                                                       | `moves through the list and the node panel from the keyboard`                            |
| AC-90 | vitest  | `apps/web/src/pages/RuleSets/__tests__/RuleSetsPage.test.tsx`                             | `Shift+N opens the own list form, N opens the catalog, neither from the search field`    |
| AC-90 | e2e     | `apps/web/e2e/keyboard.e2e.test.ts`                                                       | `Shift+N opens the own list form and N the catalog on the Rule sets screen`              |
| NFR-2 | vitest  | `apps/web/src/pages/Connections/__tests__/ConnectionsPage.budget.test.tsx`                | `a snapshot tick of 5000 connections fits the budget while closed ones are hidden`       |
| NFR-2 | vitest  | `apps/web/src/widgets/ConnectionTable/__tests__/ConnectionTable.budget.test.ts`           | `parses a snapshot of 5000 connections within the budget`                                |
| NFR-2 | bench   | `apps/metaboxd/internal/events/connections_test.go`                                       | `BenchmarkConnectionsSnapshot5000`                                                       |
| NFR-2 | bench   | `apps/metaboxd/internal/route/hits_test.go`                                               | `BenchmarkCounterObserve5000`                                                            |
