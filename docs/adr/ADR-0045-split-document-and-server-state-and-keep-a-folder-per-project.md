# ADR-0045. Separate document state from server state on the frontend, and keep the repository as a folder per project

- Status: Accepted. The decision was made on 2026-08-30 in section A.10 of [`../PRD.md`](../PRD.md) on open question OQ-1 and moved here without changes in substance
- Date: 2026-08-30
- Deciders: repository owner
- Supersedes: section A.10 of [`../PRD.md`](../PRD.md)

## Context and problem statement

The owner fixed the base of the stack: React, TypeScript, TanStack, Vite, oxlint, oxfmt (appendix B of the PRD). State management, the UI kit, routing, forms, tests and the project structure were left for a separate agreement after the PRD approval: open question OQ-1.

The defining fact: the application has **two states with different requirements**, and they cannot be covered by one tool.

- **The config document** is one large nested JSON. It is client-side, lives across screens, and requires dirty tracking, a draft separate from the applied config (UX-2), a diff before Apply (UX-6), history, addressing by string path (the auto-renderer builds fields from the schema at runtime) and raw blocks inside the tree (UX-3).
- **Dashboard runtime data** is server state: ephemeral, high-frequency, up to 5000 connections (NFR-2).

Besides the stack, it had to be decided how the Go daemon, the frontend and the schema generator live in one repository and what ties their build together.

In scope: frontend tools, repository structure, build order, test levels. Out of scope: the way the SPA is embedded in the binary ([ADR-0003](./ADR-0003-embed-the-spa-from-a-staging-directory.md)), tool versions ([ADR-0016](./ADR-0016-pin-tool-versions-where-tools-read-them.md)), rules inside the frontend: the guides in [`apps/web/docs/`](../../apps/web/docs/README.md).

## Decision drivers

- Each of the two states gets a tool suited to its requirements.
- Responsiveness on a config with 500 rules and 5000 connections (NFR-2).
- The auto-renderer assembles fields from the schema programmatically (AC-5).
- The build is reproducible: the frontend gets into the daemon binary.

## Considered options

The rejected options are named in the rationales of A.10; here they are collected together.

1. **One tool for both states**: the document in the query cache or the runtime in a client store. The requirements of the states are opposite: the document needs a draft, history and diff, the runtime needs freshness and reset. **Rejected.**
2. **The document as form state.** The document is not a form: the draft, history and diff are written explicitly, without submit semantics. **Rejected.**
3. **The runtime stream through TanStack Query.** Query on top of a stream gives a cache that lies. **Rejected.**
4. **File-based routing.** There are fewer than ten screens (six at the time of the decision), the plugin is excessive. **Rejected.**
5. **A UI kit with its own theming.** The auto-renderer needs primitives without someone else's theming on top. **Rejected.**
6. **The stack and structure from the tables below.** **Chosen.**

## Decision outcome

| Layer            | Decision                                                                            | Rationale                                                                                                                                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document state   | Zustand                                                                             | The document is not a form; the draft, history and diff are written explicitly, without submit semantics. The immer draft is removed: there is no tree in the store ([ADR-0024](./ADR-0024-drop-the-immer-draft-from-frontend-stores.md)) |
| Server state     | TanStack Query, request-response only                                               | The runtime stream (traffic, connections) bypasses Query into a separate store; Query on top of a stream gives a cache that lies                                                                                                          |
| Routing          | TanStack Router, code-based                                                         | Fewer than ten screens, the file-based plugin is excessive; typed search params keep the Connections filters in the URL                                                                                                                   |
| Tables and lists | TanStack Table + TanStack Virtual                                                   | The virtualization requirement from NFR-2                                                                                                                                                                                                 |
| Forms            | React Hook Form + `@hookform/resolvers`                                             | Uncontrolled, so fewer re-renders on a config with 500 rules                                                                                                                                                                              |
| Validation       | Zod (generated, see [ADR-0001](./ADR-0001-generate-schema-from-fork-registries.md)) | A single source with the schema                                                                                                                                                                                                           |
| UI               | shadcn/ui + Tailwind                                                                | The auto-renderer assembles fields programmatically and needs primitives without someone else's theming on top                                                                                                                            |

**RHF limitations that affect the implementation.** Field names use dot notation only (`outbounds.2.uuid`), brackets are not supported; the auto-renderer prints paths with dots. Forms are typed against the **node** type (`VLESSOutboundOptions`), not against the type of the whole config: the compiler would expand `Path<T>` over a registry union with dozens of branches. It is exactly the decision to keep the document in Zustand and open the form on a node that removes this risk. For the auto-renderer no library offers path type safety: there it is a string and a type cast.

**Repository structure**: a folder per project: `apps/metaboxd`, `apps/web`, `tools/schemagen`, each with its own manifest, `AGENTS.md` and guides. The current tree is in [`README.md`](../../README.md) and [`AGENTS.md`](../../AGENTS.md), so that the description does not drift from the repository.

The build is tied together by the Makefile: the frontend is built before `go build` because it gets into the binary through `go:embed`. The pnpm workspace holds shared devDependencies and the version catalog and does not manage the build.

**Tests**

| Level              | Tool                                                 | What it covers                                                                                                                                                                                                                                   |
| ------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Golden round-trip  | Vitest                                               | AC-1…AC-3: a set of real `config.json` files, parse → serialize, the diff must be empty. The main protection of config parsing against regressions (where adapters live: [ADR-0005](./ADR-0005-keep-foreign-api-adapters-in-the-api-segment.md)) |
| Unit and component | Vitest + Testing Library                             | Model logic, renderers, forms                                                                                                                                                                                                                    |
| Integration        | Go tests in the devcontainer against a live sing-box | AC-13…AC-16, AC-21, AC-22: the full Apply cycle with `check`, procd restart and healthcheck                                                                                                                                                      |
| Browser e2e        | Vitest, browser mode on Playwright (OQ-6)            | Automatic rollback, raw mode. The mode is not connected yet; it does not block M1 acceptance: AC-21/AC-22 are covered by daemon integration tests, AC-32 by a component test of the Apply screen                                                 |

### Scope and boundaries

The stack table matches section 9 of the PRD; the rules for using the tools are in the frontend guides: [StateManagement](../../apps/web/docs/guides/StateManagement.md), [Query](../../apps/web/docs/guides/Query.md), [Form&Validation](../../apps/web/docs/guides/Form&Validation.md), [Tables](../../apps/web/docs/guides/Tables.md), [UnitTesting](../../apps/web/docs/guides/UnitTesting.md).

## Consequences

### Positive

- The config document and the runtime evolve independently: a change to one does not break the cache or the draft of the other.
- The form on a node is typed, the compiler does not expand the union of the whole config.

### Negative

- The document's draft, history and diff are written by hand; no library provides them.
- In the auto-renderer field paths are strings without type safety.
- The browser test mode is not connected: automatic rollback and raw mode are checked by integration and component tests, not in a browser.

### Neutral or deferred

- The choice of browser test tool was moved to OQ-6 and closed on 2026-09-23: Vitest browser mode on the Playwright engine.

## Compatibility, migration and rollback

Not applicable: the decision has been in effect since OQ-1 and is moved from the PRD without changes in substance. Changes to individual rows of the stack go through their own ADRs, like [ADR-0024](./ADR-0024-drop-the-immer-draft-from-frontend-stores.md).

## Validation

- The dependencies in `apps/web/package.json` match the stack table.
- `make daemon` builds the frontend before `go build`; `make test` runs the golden round-trip and the daemon tests.

## Links

- [`../PRD.md`](../PRD.md): section 9, NFR-2, UX-2, UX-3, UX-6, OQ-1 and OQ-6 in section 10.1, appendix B, section A.10 (superseded by this ADR);
- [ADR-0001](./ADR-0001-generate-schema-from-fork-registries.md), [ADR-0003](./ADR-0003-embed-the-spa-from-a-staging-directory.md), [ADR-0004](./ADR-0004-edit-config-text-in-place-on-the-client.md), [ADR-0005](./ADR-0005-keep-foreign-api-adapters-in-the-api-segment.md), [ADR-0016](./ADR-0016-pin-tool-versions-where-tools-read-them.md), [ADR-0024](./ADR-0024-drop-the-immer-draft-from-frontend-stores.md);
- [`../../apps/web/docs/`](../../apps/web/docs/README.md): the frontend guides.
