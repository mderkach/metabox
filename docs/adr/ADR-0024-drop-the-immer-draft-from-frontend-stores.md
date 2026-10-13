# ADR-0024. Drop the immer draft from the panel stores and write state by assignment

- Status: Accepted
- Date: 2026-09-18
- Deciders: repository owner

## Context and problem statement

The factory `apps/web/src/shared/lib/state/stateCreator.ts` built every panel store from two middlewares — `devtools` and `immer`. The immer draft was adopted to edit a nested config node by assignment: this is written in the PRD (section 9 and table A.10, now [ADR-0045](./ADR-0045-split-document-and-server-state-and-keep-a-folder-per-project.md)) and in the [state guide](../../apps/web/docs/guides/StateManagement.md).

By the time of the decision none of the three stores edits nested nodes:

- the config document is stored **as text** and patched with `jsonc-parser` ([ADR-0004](./ADR-0004-edit-config-text-in-place-on-the-client.md)); the store assigns `applied`, `draft` and `revision` as a whole. The same guide records this: "Immer patches do not fit here: they describe an edit of a tree, and there is no tree in the store";
- the runtime stream stores assign top-level fields and keep two ring buffers accessed with `push` and `shift`.

The cost of the draft shows on the connections stream. The snapshot handler rebuilds `active` of five thousand rows and a `Map` index of the same size every second (NFR-2). Immer wraps the state in a proxy on every `set` and on finalization walks the new array, checking each element for draftability.

Measurement on 2026-09-18, a snapshot of 5000 connections with growing counters and connection churn:

| What was measured                       | With the immer draft | Without it |
| --------------------------------------- | -------------------- | ---------- |
| `apply`, median, normal CPU             | 14.9 ms              | 3.0 ms     |
| `apply`, median, CPU four times slower  | 61.3 ms              | 8.6 ms     |
| `apply`, maximum, CPU four times slower | 67 ms                | 13.1 ms    |

The useful work in the handler is about 1.1 ms: parsing the snapshot with the schema — 0.7 ms, walking five thousand rows with the index — 0.2 ms, the summary — 0.2 ms. In the Chrome trace the top of the self-time list was taken by `isDraftable`, `get`, `has`, `isPlainObject`, `arrayTraps`, `createProxy` and `revokeDraft` from immer.

The NFR-2 budget is "no main-thread blocks longer than 100 ms". On a CPU slowed four times, parsing the snapshot alone took two thirds of the budget, not counting the render.

In scope: the middleware set of the store factory and the form of state writes in the three panel stores. Out of scope: the set of component subscriptions and render memoization — that is separate work, and no decisions about it are made here.

## Decision drivers

1. **The NFR-2 budget.** Parsing a snapshot of 5000 connections does not eat most of the 100 ms window on a slow CPU.
2. **The PRD requirement for the config document stays met.** Draft, diff and undo work as before.
3. **An edit stays readable.** The form of state writes does not become noticeably more verbose than the one described in the guide.
4. **Backward compatibility.** The public store API — selectors and actions — does not change, calling code is not edited.
5. **Dependency cost.** A dependency that gives nothing does not stay in the tree.

## Considered options

1. **Drop immer from all stores, write state by assignment.** `set` returns a partial state explicitly, `devtools` stays. Advantages: snapshot parsing gets five to seven times faster (driver 1); the dependency and the `enableMapSet` plugin go away (driver 5); the public store API does not change (driver 4). Disadvantages: handlers that used to mutate the draft are rewritten to return an object, and ring buffers to `[...buffer, next].slice(-N)` (driver 3 — the write form changes but stays one line). **Chosen.**

2. **Drop immer only from the connections store, keep it for the others.** Advantages: minimal diff, the hot path is fixed. Disadvantages: the store factory starts building stores differently, and the rule "the middleware set does not diverge between stores", for which the factory exists, stops holding; the two remaining stores keep paying for a draft they do not use (driver 5). **Rejected.**

3. **Keep immer and speed up the handler another way** — keep the index outside the store state, update fields separately. Advantages: the PRD and the guide are not edited. Disadvantages: the proxy stays on every `set`, and the walk over the new array on finalization does not go away — this does not remove the main cost item (driver 1); state gets smeared between the store and a module. **Rejected.**

4. **Keep the current approach.** Advantages: no changes. Disadvantages: on a slow CPU snapshot handling alone takes more than half of the NFR-2 budget with 1.1 ms of useful work. **Rejected.**

## Decision outcome

The `stateCreator` factory builds a store from one middleware — `devtools`, enabled only in development. The immer draft is removed from the set, the `immer` package is removed from the `apps/web` dependencies, the `enableMapSet` call is removed from the app entry and from the test setup.

Implementation rules:

- a handler returns a partial state: `set((state) => ({ … }))` or `set({ … })`. A silent `return` without a value is not allowed: zustand takes it as the new state. The "change nothing" branch returns `state` itself — then the reference comparison passes and subscribers are not touched at all, whereas `{}` would give a new state object and a walk over the whole list;
- a ring buffer is updated with a new array: `[...buffer, next].slice(-LIMIT)`, not a `push` and `shift` pair;
- `Map` in the state stays: without the draft it needs no plugins and is replaced as a whole.

Non-goal: bringing immer back selectively into a separate store. If a nested tree appears in a store, that is a separate decision with its own measurement.

### Scope and boundaries

`apps/web/src/shared/lib/state/stateCreator.ts` and the stores `entities/Config`, `entities/Connection`, `entities/Daemon`.

## Consequences

### Positive

- Parsing a snapshot of 5000 connections fits in 8.6 ms on a CPU slowed four times against 61.3 ms — the NFR-2 budget stops depending on wrappers.
- A package that gave nothing but overhead leaves the dependency tree.
- The app entry and the test setup are no longer tied by import order through `enableMapSet`.

### Negative

- A handler that changes several fields now lists them in the returned object; the "one-line in-place edit" no longer works.
- The "change nothing" branch requires an explicit `return state`. An empty `return` silently overwrites the state with an undefined value, and the linter does not catch it: only type inference protects against the mistake.
- The stack composition is written in the PRD (section 9), in [ADR-0045](./ADR-0045-split-document-and-server-state-and-keep-a-folder-per-project.md) and in the state guide, so the decision edits them too: code and documents must not diverge.

### Neutral or deferred

- The set of subscriptions on the home screen and memoization of connection table rows stay as is: this is the next largest cost item, and it is solved separately.

## Compatibility, migration and rollback

The public store API does not change: selectors, actions and their signatures are the same, calling code is not edited. There is no transition period — the middleware set changes at once for all stores.

Rollback: return `immer` to the dependencies and to the middleware set, return `enableMapSet` to the app entry and to the test setup, rewrite handlers back to draft mutation. Data and contracts are not affected.

## Validation

- `pnpm --filter web test` — the suite has a snapshot parsing budget: `apps/web/src/widgets/ConnectionTable/__tests__/ConnectionTable.budget.test.ts` parses 5000 connections with churn and fails if the best of the runs goes over 12 ms — half of what bringing the wrapper back would cost;
- `grep -rn immer apps/web/src apps/web/docs apps/web/package.json docs` — code, manifest and documents keep only explanations of why there is no wrapper;
- manual scenario: `METABOX_MOCK=all METABOX_MOCK_CONNECTIONS=5000 pnpm --filter web dev`, the connections screen, measuring `apply` in the console with the CPU slowed four times — the median is in single milliseconds, not tens.

## Links

- [PRD](../PRD.md), section 9, and [ADR-0045](./ADR-0045-split-document-and-server-state-and-keep-a-folder-per-project.md) — the frontend stack; NFR-2 — the responsiveness budget;
- [ADR-0004](./ADR-0004-edit-config-text-in-place-on-the-client.md) — the config document is edited as text, not as a tree;
- [State management](../../apps/web/docs/guides/StateManagement.md);
- `apps/web/src/shared/lib/state/stateCreator.ts`, `apps/web/src/entities/Connection/model/Connection.store.ts`.
