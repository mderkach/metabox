# Frontend testing

The panel is tested on three levels, and the build tooling has tests of its own. This page decides which level a check belongs to; each guide below covers its tools and how to write tests with them.

| Level                        | Runner                                              | Files                                 | Runs                                                   | Guide                              |
| ---------------------------- | --------------------------------------------------- | ------------------------------------- | ------------------------------------------------------ | ---------------------------------- |
| Unit and component, jsdom    | Vitest + Testing Library, projects `unit`, `budget` | `src/**/__tests__/*.test.{ts,tsx}`    | `pnpm --filter web test`, pre-push, CI job `web`       | [Unit.md](./Unit.md)               |
| Component in a real browser  | Vitest, project `browser`, Chromium                 | `src/**/__tests__/*.browser.test.tsx` | `pnpm --filter web test:browser`, CI job `web-browser` | [Unit.md](./Unit.md#browser-tests) |
| End-to-end scenario          | Playwright Test, Chromium                           | `e2e/*.e2e.test.ts`                   | `pnpm --filter web test:e2e`, CI job `web-browser`     | [E2E.md](./E2E.md)                 |
| Lint rules and build tooling | Vitest, project `tooling`, Node                     | `tools/**/*.test.js`                  | `pnpm --filter web test`, pre-push, CI job `web`       | [Unit.md](./Unit.md#tooling-rules) |

The principles shared with the daemon are in [`docs/Testing.md`](../../../../../docs/Testing.md); the guides here are how the panel applies them. Decisions behind the levels: [ADR-0064](../../../../../docs/adr/ADR-0064-run-browser-tests-in-a-vitest-browser-project-next-to-jsdom.md) for the browser project, [ADR-0075](../../../../../docs/adr/ADR-0075-run-end-to-end-scenarios-with-playwright-test-on-the-mock-stand-and-the-live-daemon.md) for e2e.

## Choosing a level

A check goes to the lowest level that can show the defect: lower levels are faster, need no browser and point closer to the cause.

- **jsdom** is the default: a component's states and texts, form behaviour and validation, dialog closing (the cross, Esc, the backdrop), input parsing, stores, schemas, query hooks, mocked network answers.
- **The browser project** when jsdom cannot reproduce what the test checks: Base UI dropdowns and other pointer interactions, layout and sizes, computed styles, accessibility checks by a tool.
- **An e2e scenario** for a user flow that crosses screens, the draft and the Apply cycle, or the router, when no component test can show it broken: editing a rule and applying it, a rollback after a missed confirmation, a route that loses the draft.

A check that moves down a level is removed from the level above, so one behaviour has one test.

A change visible in the panel is also gone through in a browser before the PR, by an e2e scenario or by hand: the rule is in [`apps/web/AGENTS.md`](../../../AGENTS.md).
