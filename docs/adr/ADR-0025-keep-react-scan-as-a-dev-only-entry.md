# ADR-0025. Keep react-scan as a dev dependency and connect it through a separate dev server entry

- Status: Accepted
- Date: 2026-09-18
- Deciders: repository owner

## Context and problem statement

The NFR-2 budget is "no main-thread blocks longer than 100 ms" on a config of up to 500 rules and a snapshot of up to 5000 connections. A Chrome trace answers how long the work took and where exactly, but not **which component** renders and how many times: the profile shows `prepareFreshStack` and `commitTextUpdate`, not `ConnectionRowProto`.

React DevTools shows this picture, but only a person can take it by eye: the update highlight lives for tens of milliseconds, and the profiler does not give a machine-readable summary. A repeatable measurement — and an agent that runs it — needs programmatic access to render counters.

A constraint set by the build: the built panel goes into the daemon binary via `go:embed` ([ADR-0003](./ADR-0003-embed-the-spa-from-a-staging-directory.md)), so a development tool must not get into `dist` under any circumstances.

In scope: what to use to collect per-component render counters and how this tool is connected. Out of scope: what to do with the re-renders found — the set of subscriptions and memoization are solved separately.

## Decision drivers

1. **Does not get into the production build.** Checked by the build, not by intent.
2. **Data is collected programmatically.** A per-component summary is available from the page console, not only by eye from an overlay.
3. **Cost in the dependency tree.** The tool does not pull more into the repository than it gives.
4. **Does not break the exact versions rule.** A direct dependency is pinned, the repository manifest has no ranges.

## Considered options

1. **`react-scan` in `devDependencies` plus a separate entry `apps/web/dev/scan.ts`.** The entry is added to `index.html` by the `metabox-scan` plugin under `METABOX_SCAN=1`, instrumentation is installed before the first render, the per-component summary lives in `window.__metaboxScan`. Advantages: gives both an overlay for the eye and counters for collection (driver 2); `apply: 'serve'` and the absence of references from `src` keep it out of the build (driver 1); the version is pinned exactly (driver 4). Disadvantages: pulls `react-doctor`, `react-grab`, `preact`, `@preact/signals`, `bippy` and `oxlint-plugin-react-doctor` — the lock grows by 1165 lines, about 16 MB in `node_modules`, of which 9.5 MB is `react-doctor` alone (driver 3). **Chosen.**

2. **One-off run via `pnpm dlx` without recording it in the manifest.** Advantages: the repository dependency tree does not grow. Disadvantages: does not work for the needed mode — `dev/scan.ts` imports `react-scan` as a module, and `dlx` installs the package into a temporary directory that is not in the dev server build graph (driver 2). It fits only the CLI mode on top of a ready page, and that gives an overlay without programmatic access. **Rejected.**

3. **Make do with the Chrome trace.** Advantages: the tool is already connected (`.mcp.json`), zero new dependencies. Disadvantages: gives no per-component render counters (driver 2). To be honest: the decisive finding — the cost of the immer draft ([ADR-0024](./ADR-0024-drop-the-immer-draft-from-frontend-stores.md)) — came from the trace, and react-scan only showed that renders are secondary. **Rejected as the only tool, kept as the main one.**

4. **React DevTools by hand.** Advantages: nothing is installed in the repository. Disadvantages: the measurement is not repeatable and not collected programmatically (driver 2). **Rejected.**

## Decision outcome

`react-scan` lives in the `devDependencies` of the `apps/web` package with an exact version. It is connected only through the `metabox-scan` plugin in `vite.config.ts`: the plugin returns `false` without `METABOX_SCAN=1` and declares `apply: 'serve'`, so it takes no part in the build.

Rules:

- the tool entry lives in `apps/web/dev/`, the directory has its own types project `tsconfig.dev.json`; `src` must not reference it — the absence of references is exactly what keeps it out of the bundle;
- the script is inserted into `head`, before the app entry: instrumentation replaces the devtools hook, and after the first render it is too late to do so;
- the summary is collected from `window.__metaboxScan`; the milliseconds from there do not count as an NFR-2 metric on their own — instrumentation adds its own time.

Non-goal: running react-scan in CI. It is a developer tool, not a check.

## Consequences

### Positive

- Per-component render counters are collected with one command from the page console and fit a repeatable measurement.
- The overlay with component names is available on the same test bench as the mocks for 5000 connections.

### Negative

- The lock grew by 1165 lines, the tree got `react-doctor` (9.5 MB), `react-grab`, `preact`, `@preact/signals`, `bippy` and `oxlint-plugin-react-doctor` — about 16 MB together with the profiler itself.
- The `react-scan` manifest itself declares two dependencies as `latest`. The lock pins them, but on the next update arbitrary versions will come in — this has to be reviewed by eye in the lock diff.
- One more top-level directory in `apps/web` and one more project in `tsconfig.json`.

### Neutral or deferred

- The Chrome trace stays the primary measurement tool; react-scan answers a different question and does not replace the trace.

## Compatibility, migration and rollback

The decision does not touch application code: without `METABOX_SCAN=1` the dev server behaves as before. Rollback: delete `apps/web/dev/`, `tsconfig.dev.json`, the `metaboxScan` plugin and the dependency; nothing besides these files needs to be touched.

## Validation

- `pnpm --filter web build`, then `grep -r "react-scan\|bippy\|__metaboxScan" apps/web/dist` — no matches;
- `grep -rn "dev/scan" apps/web/src apps/web/index.html` — no references from application code;
- manual scenario: `METABOX_SCAN=1 METABOX_MOCK=all METABOX_MOCK_CONNECTIONS=5000 pnpm --filter web dev`, `__metaboxScan.summary()` in the console returns a list of components with render counts.

## Links

- [ADR-0003](./ADR-0003-embed-the-spa-from-a-staging-directory.md) — the built panel goes into the daemon binary;
- [ADR-0024](./ADR-0024-drop-the-immer-draft-from-frontend-stores.md) — the measurement the tool was introduced for;
- `apps/web/dev/scan.ts`, `apps/web/vite.config.ts`.
