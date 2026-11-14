# Measuring performance

How to check a performance claim about the panel. The thresholds are in `docs/PRD.md`, NFR-2 (responsiveness under load): up to 5000 live connections and 500 rules, no main thread block longer than 100 ms.

## Measure before naming a cause

A cause is named after a measurement, not from reading the code. A report separates what a measurement confirmed from what it did not.

- A trace: the `chrome-devtools` MCP, with `cpuThrottlingRate: 4`. On a developer machine the headroom hides a block that a weak laptop or phone hits.
- Render counts: react-scan, `METABOX_SCAN=1` on the dev server ([ADR-0025](../../../../docs/adr/ADR-0025-keep-react-scan-as-a-dev-only-entry.md)).
- The cost of one function: a microbenchmark in the page console, for example calling `ConnectionStore.getState().apply(frame)` directly.

## The mock stand distorts traces

On `make dev-mock` the connection snapshot comes from MSW (Mock Service Worker) in a service worker. With `METABOX_MOCK_CONNECTIONS=5000` its `getResponse` took 14 of 17 seconds of a trace, more than the panel itself; the product has no such path, there the stream comes from the daemon.

- Read long tasks of the mock stand as tooling cost until a microbenchmark of the application function says otherwise.
- Take a trace without `METABOX_SCAN`: react-scan adds its own cost.

## First page size budget

The login screen and the panel shell must not wait for code of screens they do not show. The panel behind the login gate is a lazy chunk (`app/ui/Panel.tsx`), and each screen is a lazy route component, so the fork schema (`shared/api/generated.ts`) loads with the panel, not with the login screen.

`pnpm --filter web check:bundle` reads the built `dist/index.html` and sums the raw bytes of the entry script and every `modulepreload` chunk. It fails when the sum is over `BUDGET_BYTES` or when a chunk from `FORBIDDEN_CHUNKS` (the fork schema) is preloaded. CI runs it after the build in the `web` job.

- The budget is `BUDGET_BYTES` in `apps/web/tools/bundleBudget.js`: 650 000 bytes, about 7% above the 606 651 the first page took when the check was introduced.
- A failure is read from the printed list: the file that grew or appeared shows which static import pulled code into the first page. Move that import behind a route or a lazy component before touching the budget.
- The budget is raised by editing the constant, with the reason and the before/after list in the PR description.
