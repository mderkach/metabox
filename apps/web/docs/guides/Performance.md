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
