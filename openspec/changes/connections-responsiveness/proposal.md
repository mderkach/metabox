## Why

The Connections screen is the main diagnostic tool and has to stay usable on a busy router. The table is virtualized and the daemon aggregates the stream, but the only measurements are jsdom budgets and benchmarks on a developer machine: nothing measures the screen in a browser or the daemon on the device.

Issue: #259 (no browser measurement of main-thread blocks); issue #238 covers the daemon cost on the device.

## What Changes

- Add a browser measurement on the mock stand: a config with hundreds of rules, a stream of thousands of connections, the longest main-thread task during snapshot ticks, a sort and a filter (issue #259).
- Measure on the device under a synthetic load of several thousand connections: daemon CPU and memory with the panel closed and open, and the same browser measurement against the device (issue #238).
- Fix what "responsive" means for AC-30 before measuring (see Open questions).
- Add the AC-30 rows to `docs/Verification.md`; keep the jsdom budgets as regression guards.
- If a measurement exceeds the threshold: open an issue with the measured bottleneck and keep this change open.

## Capabilities

### Modified Capabilities

- `connections`: AC-30.

## Impact

- `apps/web/e2e` and the mock handlers of the dev stand: a fixture with hundreds of rules and thousands of connections; the `web-browser` job of `.github/workflows/ci.yml` if the measurement runs in CI.
- `apps/web/docs/guides/Performance.md`, `docs/Verification.md`, the Validation of ADR-0029 (count rule hits in the daemon from connection snapshots).
- The device: a manual run with a load generator.
- `apps/web/src/pages/Connections`, `apps/web/src/widgets/ConnectionTable`, `apps/metaboxd/internal/events`, `internal/route`: only if a measurement finds a bottleneck.

## Already built

- The connection table and the rule table render through a virtualizer: `apps/web/src/widgets/ConnectionTable/ui/ConnectionTable.tsx`, `apps/web/src/widgets/Rule/RuleTable/ui/RuleTable.tsx`.
- jsdom budgets, listed under NFR-2 in `docs/Verification.md`: `ConnectionsPage.budget.test.tsx` (`a snapshot tick of 5000 connections fits the budget while closed ones are hidden`, `TICK_BUDGET_MS = 250`), `ConnectionTable.budget.test.ts` (parse and two sorts of 5000 rows). The TSDoc of the first says the numbers do not carry over to a browser and that the test catches only a several-fold slowdown.
- The hidden tab does not re-render on a tick: `ConnectionsPage.test.tsx`, `the hidden tab stands on a snapshot, and the number on its label is live`.
- Daemon benchmarks: `BenchmarkConnectionsSnapshot5000`, `BenchmarkHubFanOut5000` (`apps/metaboxd/internal/events`), `BenchmarkCounterObserve5000` (`apps/metaboxd/internal/route/hits_test.go`). No `-bench` run was found in `Makefile` or `.github/`: they are run by hand.
- Not built: a browser measurement (issue #259), a device measurement (issue #238 has one reading at about 220 connections), and any Connections test with hundreds of rules in the config.

## Out of scope

- NFR-2 (up to 500 rules and 5000 connections, no main-thread block over 100 ms): in `openspec/specs/non-functional/spec.md`; this change supplies the measurement both lack.
- The login cost on the device (the other half of issue #238).
- AC-12 (the Connections screen lists and closes connections): built, in `openspec/specs/connections/spec.md`.
- Overview and its traffic split (AC-97, `openspec/changes/overview-for-newcomers/`): it shares the connection poll, and its memory at 5000 connections is measured there.

## Open questions

- The owner has not approved this proposal: it carries a criterion that was not marked as done when the criteria moved out of the product document.
- AC-30 says "responsive" with no number. Take the NFR-2 threshold (no main-thread task over 100 ms at 500 rules and 5000 connections), or a separate one?
- AC-30 and NFR-2 overlap, and NFR-2 is recorded as built on jsdom budgets that do not measure its 100 ms. Keep both, or fold AC-30 into NFR-2 once the browser measurement exists?
- Does the browser measurement gate CI (shared runners are noisy) or is it a documented manual run with the machine and build recorded?
- Which browser and machine count for the threshold: the developer laptop, a phone, both?
