# ADR-0028. Show loading as a delayed skeleton, and take block states from the query

- Status: Accepted
- Date: 2026-09-23
- Deciders: repository owner

## Context and problem statement

The panel screens handled the same situations differently:

- **loading** — a "Loading…" line in six places, a dash on the overview, nothing on connections;
- **empty** — dashes, a dashed box, a dashed section with a form, `Alert`;
- **source failure** — `Alert` in some places, nothing in others. `useConfigDocument` returned only `isPending`: on a config failure the rules, rule sets and text screens showed an empty space and one toast, that is, the error was swallowed.

The state was derived from data emptiness: during `isPending` the rule set list was already empty, and the rule sets screen showed the "no rule sets" form before the daemon answered.

The review of 2026-09-22 "Same situations solved with different idioms" decided: loading is a skeleton, not a line; states come from TanStack Query (`isPending`, `isError`, `isFetching`); loading, empty and failure are three different screens; errors are not swallowed; the skeleton does not flash on a fast response.

Facts about the libraries, checked on 2026-09-23:

- `Query.md` already required fetching screen data in the route loader, but the loaders fetched only dictionaries.
- TanStack Router recommends a route loader that puts data into the cache before render, "without a loading flash". The route loading screen appears after `pendingMs` (1000 ms by default) and stays at least `pendingMinMs` (500 ms).
- Router navigation runs inside a React transition: the old screen stays while the new one loads.
- TanStack Query itself does not support React transitions: React keeps previous data via `startTransition` around `useSuspenseQuery`.
- In TanStack Query 5.103 `prefetchQuery`, `fetchQuery` and `ensureQueryData` are deprecated. `queryClient.query` replaces them.
- The practice for an indicator inside a screen is to show it with a 200–400 ms delay so that a fast response does not flash.

The panel must open with sing-box down (`Query.md`, "Failures and unavailability"), and a failure of one source must not blank out the whole screen.

Out of scope: empty captions in the overview cards, configuration tabs, counters and charts outside the six screens.

## Decision drivers

1. The state is taken from the query, not derived from data.
2. A fast response shows no skeleton at all; a slow one shows it, not a frozen screen.
3. A source failure is visible in place of the block with the cause and a retry; the screen stays open.
4. An error the screen did not handle is visible instead of turning into an empty screen.
5. No deprecated library APIs.
6. No new dependencies; shadcn primitives, not custom markup.

## Considered options

1. **A route loader plus `useQuery` flags inside the screen.**
   - The loader waits for screen data via `queryClient.query(options).catch(...)`. A fast response shows the screen right away with data, a slow one shows the shared screen skeleton after `defaultPendingMs`.
   - Inside the screen `isPending` shows a skeleton with a delayed reveal, `isLoadingError` shows a failure block, a successful empty response shows `Empty`.
   - An unexpected error goes to `defaultErrorComponent`.
   - Meets all drivers.
   - Downside: two loading mechanisms — the router's and the block's — have to be kept consistent.
   - **Chosen.**
2. **Only `useQuery` flags and a skeleton delay, without loaders.** Simpler, but every transition between screens goes through a skeleton on the first frame, and the mismatch with `Query.md` about loaders remains. **Rejected.**
3. **`useSuspenseQuery` with `Suspense` and the route `errorComponent` for all errors.**
   - A failure of any source blanks out the whole screen: with sing-box down the proxy screen would not open, and it must (driver 3).
   - `useSuspenseQuery` has no `isPending` and `isError` flags, and the 2026-09-22 decision requires taking them from the query.
   - **Rejected.**
4. **Keep the "Loading…" line.** Contradicts the 2026-09-22 decision and does not tell loading from empty. **Rejected.**

## Decision outcome

**Route loaders** (`apps/web/src/app/router/Router.tsx`):

- wait for screen data: the config for the configuration section, proxies and subscriptions for the proxy screen, proxies and traffic history for the overview;
- fetch them via `QueryClientInstance.query(options).catch(keepFailureForScreen)` and do not throw a failure: it stays in the cache, and the screen block shows it;
- `prefetchQuery`, `fetchQuery` and `ensureQueryData` are not used.

**Router:**

- `defaultPendingMs: 300` and `defaultPendingComponent: PendingPage` — the shared screen skeleton;
- `defaultErrorComponent: ErrorPage` — the boundary sits at every route inside the shell, so the sidebar stays.
- `ErrorPage` speaks in the user's words: something went wrong, the config and sing-box on the router are not affected. The action is to reload the page; the exception text sits under a disclosure for a report.

**Screen block:**

- **loading** — `isPending` shows `SkeletonRows` or `Skeleton` with the `PENDING_REVEAL` class: a reveal delayed by 200 ms via `tw-animate-css`;
- **failure** — `isLoadingError` shows `QueryFailure` with the cause via `failureText` and "Retry" on `refetch`. A failure over existing data (`isRefetchError`) does not hide the data, a toast from `meta` reports it;
- **empty** — a successful response without data shows `Empty`. "Empty because of filtering" is a separate `Empty` with a reset button;
- `useConfigDocument` returns the file query (`query`), and the configuration section screens take states from it.

**Texts.** Read failure keys live in `shared` under `source.*` and are shared between the toast in `meta` and the `QueryFailure` block. Action failure keys stay under `toast.*`.

**Primitives.** `skeleton` and `empty` are added via `shadcn add` to `shared/ui/shadcn`, `SkeletonRows` and `QueryFailure` are custom code in `shared/ui`.

**Streaming screens** (overview, connections) bypass Query. There loading means "the first stream snapshot has not arrived": `sampledAt === null` in its store, and `null` instead of a tile value means a skeleton. A dash remains only for a value that does not exist at all.

### Scope and boundaries

- `apps/web/src/app/router/`, `apps/web/src/app/ui/PendingPage.tsx`, `ErrorPage.tsx`;
- `apps/web/src/shared/ui/SkeletonRows.tsx`, `QueryFailure.tsx`, `styles.ts` (`PENDING_REVEAL`);
- `apps/web/src/entities/Config/model/Config.document.ts`, the `meta` keys in `entities/*/api`;
- the screens for rules, rule sets, config text, proxies, connections and the overview, the route explanation panel, the version history dialog.

## Consequences

### Positive

- A config failure on the configuration section screens is visible with the cause and a retry, not as an empty space.
- The rule sets screen does not show the "no rule sets" form until the config has arrived.
- A fast transition between screens shows no skeleton at all: the data is already in the cache.
- Speed and counters are not printed as zero before the first stream frame.

### Negative

- A transition to a screen with a slow source holds the old screen up to 300 ms before the skeleton appears.
- A read failure is reported twice: by a toast and by a block. The toast is needed where there is no block — the apply bar, background refetches — and the query `meta` is one for all consumers.
- `PendingPage` is shared and does not repeat the layout of a specific screen.
- The skeleton is revealed with a CSS animation: under `prefers-reduced-motion` the delay stays, and the fade lasts the same 300 ms.

### Neutral or deferred

- Empty captions in the overview cards and the configuration tabs remain debt.

## Compatibility, migration and rollback

The decision does not change daemon contracts. The keys `toast.config.draft.fetchFailed`, `toast.config.versions.fetchFailed`, `toast.proxy.list.fetchFailed`, `toast.proxy.providers.fetchFailed` and `toast.route.explain.failed` are renamed to `source.*`: the toast texts did not change.

Rollback in parts:

- remove `query` from the loaders and `default*` from the router — screens keep showing the block skeleton;
- return the loading lines — the `shared/ui` primitives then stay unused.

## Validation

- `pnpm --filter web exec vitest run Editor Overview Connections DaemonTraffic`: a config failure shows the cause and a retry, the retry refetches; a config without rules says so; charts show loading, not a line, until the second point.
- `pnpm lint`, `tsc -b` — deprecated Query methods do not occur in the code.
- Browser: on the test bench with mocks, transitions between screens without a skeleton flash; with the config mock stopped — a failure block with the cause.

## Links

- `apps/web/docs/guides/Query.md` — sections "Block states" and "Retries and prefetch";
- [ADR-0026](./ADR-0026-animate-screen-changes-with-the-router-and-in-page-changes-with-react.md) — screen transitions;
- [TanStack Router: data loading, `pendingMs`, `pendingMinMs`](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading);
- [TanStack Router + Query: loader and cache](https://tanstack.com/router/latest/docs/integrations/query);
- [React: `<Suspense>`](https://react.dev/reference/react/Suspense);
- [React Loaders and Skeletons: What a Slow Screen Actually Needs](https://21st.dev/blog/react-loader-components), [NN/g: Skeleton Screens 101](https://www.nngroup.com/articles/skeleton-screens/).
