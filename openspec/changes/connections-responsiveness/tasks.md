## 1. Existing guards

- [x] 1.1 AC-30, NFR-2: the connection table is virtualized and a tick of 5000 connections, its parse and its sorts fit the jsdom budgets. Evidence: `ConnectionsPage.budget.test.tsx`, `ConnectionTable.budget.test.ts`; `pnpm --filter web test`.
- [x] 1.2 AC-30, NFR-2: daemon benchmarks for a 5000-connection snapshot, fan-out and rule hit count exist. Evidence: `BenchmarkConnectionsSnapshot5000`, `BenchmarkHubFanOut5000`, `BenchmarkCounterObserve5000`; `cd apps/metaboxd && go test -run '^$' -bench 5000 ./internal/events ./internal/route`.

## 2. Threshold

- [ ] 2.1 AC-30: write the threshold and the load (rules, connections, tick rate, actions) into `design.md` after the owner answers the open questions. Verify: manual: the owner approves it.

## 3. Browser measurement

- [ ] 3.1 AC-30, NFR-2: add a mock fixture with 500 rules and a stream of 5000 connections to the dev stand. Verify: `pnpm --filter web test`.
- [ ] 3.2 AC-30, NFR-2: a Playwright scenario opens Connections on that fixture, records the longest main-thread task (Long Tasks API) over snapshot ticks, a sort, a filter and a tab switch, and compares it with the threshold of 2.1 or prints it with the machine and build. Verify: `pnpm --filter web test:e2e`.
- [ ] 3.3 AC-30, NFR-2: add the rows of 3.2 to `docs/Verification.md` and the measured numbers to `apps/web/docs/guides/Performance.md`; close issue #259. Verify: `make trace-check`.

## 4. Device measurement

- [ ] 4.1 AC-30: manual: on the device, under a synthetic load of several thousand connections, record daemon CPU and memory with the panel closed and open, and the longest main-thread task of the Connections screen opened against the device. Keep the load generator and its output off the router.
- [ ] 4.2 AC-30: write the numbers into the Validation of ADR-0029 and add the manual row to `docs/Verification.md`. Verify: `make trace-check`.
- [ ] 4.3 AC-30: if 3.2 or 4.1 exceeds the threshold, open an issue with the measured bottleneck and keep this change open.
