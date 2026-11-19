# ADR-0086. Time the Connections screen nightly on a mock stand with the production build of React

- Status: Accepted
- Date: 2026-11-19
- Deciders: repository owner

## Context and problem statement

NFR-2 (non-functional requirement 2, `openspec/specs/non-functional/spec.md`) says the panel holds up to 5000 live connections and 500 rules with no main-thread block longer than 100 ms. Until now only jsdom budgets checked it, with a 250 ms margin that catches a several-fold regression, not the threshold (issue [#259](https://github.com/mderkach/metabox/issues/259)).

A browser measurement on the e2e mock stand ([ADR-0075](./ADR-0075-run-end-to-end-scenarios-with-playwright-test-on-the-mock-stand-and-the-live-daemon.md)) found:

- The mock stream itself distorts timings: the msw stream handler builds and serializes every 5000-row snapshot on the page and passes it through the service worker, which costs more than the panel.
- The stand is the Vite dev server, so React runs its development build, with `StrictMode` double renders. On it the longest task of a step was 0–100 ms on an Apple M4 Pro and 106–211 ms on a GitHub runner; with the production build it was below 50 ms on the same laptop.
- Shared CI runners vary from run to run, and the `web-browser` job is required for merging, where a test that passes only on retry fails the run.

In scope: where and on which build the Connections timing runs and how its result is used. Out of scope: the device measurement (issue [#238](https://github.com/mderkach/metabox/issues/238)) and any optimization of the screen.

## Decision drivers

- Measure the threshold on the build users get, not one several times slower.
- Keep the mock out of the measured main-thread time.
- A noisy timing must not block merges of unrelated pull requests.
- Reuse the e2e runner, its page objects and the mock stand instead of a second harness.

## Considered options

1. **Gate at 100 ms in the required `web-browser` job, on the development build.** Fails on every CI run (106–211 ms) because of the build, not the panel. **Rejected.**
2. **Gate in the required job with a loose threshold, like the jsdom 250 ms.** Catches only a several-fold regression, which jsdom already does. **Rejected.**
3. **Record the numbers only, with no automatic comparison.** The threshold stays unchecked between manual runs. **Rejected** as the only check; the numbers are still recorded.
4. **A load stand with the production build of React, compared with 100 ms in a separate nightly and manual workflow that blocks no merge.** Measures the shipped build; a noisy night shows up as a failed run without stopping work. **Chosen.**

## Decision outcome

- `METABOX_E2E_STAND=load` in `apps/web/playwright.config.ts` is the mock stand with `METABOX_REACT=production`: the `metabox-production-react` plugin of `apps/web/vite.config.ts` gives the dev server the production React (`process.env.NODE_ENV`, JSX without the dev runtime, a cache directory of its own). The stand runs one worker and never reuses a running dev server.
- A scenario that times the main thread carries `E2E_TAG.Load` (`@load`) and no other stand tag.
- The runtime stream of such a scenario does not go through msw: the scenario sets `window.__METABOX_CONNECTION_LOAD__` before the page loads, and `apps/web/mocks/connectionLoad.ts` serializes the frames in advance and replaces only the runtime `EventSource`. Other requests still go to msw.
- `.github/workflows/connections-load.yml` runs `pnpm --filter web test:e2e --grep @load` on the load stand by schedule every night and by `workflow_dispatch`. It is not a dependency of `checks` and blocks no merge.
- The scenario prints the longest task of each step and the scripts of the longest animation frame, then compares each step with 100 ms at CPU rate 1×.
- Non-goal: optimizing the screen. That is decided after stable nightly numbers.

## Consequences

### Positive

- NFR-2's 100 ms has an automatic check on the build users get.
- A failed night names the step and the script that blocked.

### Negative

- A regression is noticed up to a day late, and a red nightly run on a busy runner may be noise; it is read with the printed numbers.
- The dev server gets a second React mode to keep working with Vite and `@vitejs/plugin-react` updates.
- The production build on the dev server is not byte-for-byte the build the daemon serves: modules are not bundled or minified.

### Neutral or deferred

- The 500 rules exist only as the matched rule texts of the connections: the Connections screen does not read the config.
- Moving the check into the required job, if the nightly numbers prove stable.

## Compatibility, migration and rollback

No product behaviour changes, and nothing from the stand reaches the build: both the mock entry and the plugin apply only to `serve`. Rollback: remove `connections-load.yml`, the `load` stand of `playwright.config.ts`, `metaboxProductionReact` of `vite.config.ts` and the `@load` scenario.

## Validation

- `METABOX_E2E_STAND=load pnpm --filter web test:e2e --grep @load` runs `e2e/connectionsLoad.e2e.test.ts`, prints `[MAIN THREAD]` with the longest task of each step and fails a step at 100 ms.
- `node_modules/.vite-production-react/deps/react-dom_client.js` of the load stand holds no development build of React.
- `pnpm --filter web test:e2e --grep @mock` does not run the `@load` scenario.
- `.github/workflows/connections-load.yml` triggers on `schedule` and `workflow_dispatch`, and `checks` in `.github/workflows/ci.yml` does not depend on it.

## Links

- `openspec/specs/non-functional/spec.md`: NFR-2; `docs/Verification.md`
- [ADR-0075](./ADR-0075-run-end-to-end-scenarios-with-playwright-test-on-the-mock-stand-and-the-live-daemon.md): e2e scenarios and stands
- [ADR-0025](./ADR-0025-keep-react-scan-as-a-dev-only-entry.md): another dev-only plugin of the dev server
- `apps/web/docs/guides/Performance.md`: the measured numbers
- Issue [#259](https://github.com/mderkach/metabox/issues/259)
