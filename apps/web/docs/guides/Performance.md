# Measuring performance

How to check a performance claim about the panel. The thresholds are in `openspec/specs/non-functional/spec.md`, NFR-2 (responsiveness under load): up to 5000 live connections and 500 rules, no main thread block longer than 100 ms.

## Measure before naming a cause

A cause is named after a measurement, not from reading the code. A report separates what a measurement confirmed from what it did not.

- A trace: the `chrome-devtools` MCP, with `cpuThrottlingRate: 4`. On a developer machine the headroom hides a block that a weak laptop or phone hits.
- Render counts: react-scan, `METABOX_SCAN=1` on the dev server ([ADR-0025](../../../../docs/adr/ADR-0025-keep-react-scan-as-a-dev-only-entry.md)).
- The cost of one function: a microbenchmark in the page console, for example calling `ConnectionStore.getState().apply(frame)` directly.

## The mock stand distorts traces

On `make dev-mock` the connection snapshot comes from MSW (Mock Service Worker) in a service worker. With `METABOX_MOCK_CONNECTIONS=5000` its `getResponse` took 14 of 17 seconds of a trace, more than the panel itself; the product has no such path, there the stream comes from the daemon.

- Read long tasks of the mock stand as tooling cost until a microbenchmark of the application function says otherwise.
- Take a trace without `METABOX_SCAN`: react-scan adds its own cost.

## Connections under load in a browser

`e2e/connectionsLoad.e2e.test.ts` opens Connections with 5000 live connections matched by 500 different rules, and prints the longest main-thread task (Long Tasks API) of each step: five snapshot ticks, a sort by Volume and by To, typing a search, switching tabs. It also prints the scripts of the longest animation frame of the step (Long Animation Frames API), which names the place of a block.

- The stream does not go through msw. The scenario sets `__METABOX_CONNECTION_LOAD__` before the page loads, and the mock entry (`mocks/connectionLoad.ts`) serializes 40 frames in advance and replaces the runtime `EventSource` with one that dispatches a ready string once a second. The main thread pays for the parse, the store and the render, as with the daemon; the push itself took 9 ms at 4× slowdown. The other requests still go to msw.
- It runs as the Playwright project `load`, alone: CI runs it in its own step of the `web-browser` job. Locally: `pnpm --filter web test:e2e --project load`; `METABOX_E2E_CPU_RATE=4` slows the page down as a weak laptop or a phone would.
- The stand is the Vite dev server, so React runs its development build, with `StrictMode` double renders. The scenario records the numbers and compares nothing: on this build the 100 ms threshold is crossed on a fast machine already.

Measured 2026-11-19, Apple M4 Pro, Chromium headless shell of Playwright 1.64.1, longest task over the steps of a run, three runs each:

| Build of React                                                                 | CPU | Longest task                            | Where                                                                             |
| ------------------------------------------------------------------------------ | --- | --------------------------------------- | --------------------------------------------------------------------------------- |
| development (the stand)                                                        | 1×  | 56–100 ms                               | the `flush` timer of `listenConnections` (store apply and render), the sort click |
| development (the stand)                                                        | 4×  | 318–584 ms                              | the same, and the search input                                                    |
| production (`process.env.NODE_ENV`, JSX without dev runtime, local experiment) | 1×  | none of 50 ms or more                   |                                                                                   |
| production (local experiment)                                                  | 4×  | 54–105 ms, one step of fifteen over 100 | the sort click, the search input, the `flush` timer                               |

The production rows come from a temporary Vite config that is not in the repository: the build the daemon serves has no mocks, so the stand cannot run it as is.

## First page size budget

The login screen and the panel shell must not wait for code of screens they do not show. The panel behind the login gate is a lazy chunk (`app/ui/Panel.tsx`), and each screen is a lazy route component, so the fork schema (`shared/api/generated.ts`) loads with the panel, not with the login screen.

`pnpm --filter web check:bundle` reads the built `dist/index.html` and sums the raw bytes of the entry script and every `modulepreload` chunk. It fails when the sum is over `BUDGET_BYTES` or when a chunk from `FORBIDDEN_CHUNKS` (the fork schema) is preloaded. CI runs it after the build in the `web` job.

- The budget is `BUDGET_BYTES` in `apps/web/tools/bundleBudget.js`: 650 000 bytes, about 7% above the 606 651 the first page took when the check was introduced.
- A failure is read from the printed list: the file that grew or appeared shows which static import pulled code into the first page. Move that import behind a route or a lazy component before touching the budget.
- The budget is raised by editing the constant, with the reason and the before/after list in the PR description.
