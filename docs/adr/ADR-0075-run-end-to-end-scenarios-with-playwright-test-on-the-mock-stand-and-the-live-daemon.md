# ADR-0075. Run end-to-end scenarios with Playwright Test on the mock stand and the live daemon

- Status: Proposed
- Date: 2026-11-13
- Deciders: repository owner

## Summary

The panel gets end-to-end tests: a whole user scenario in a real browser, the way a person goes through it. They are written in Playwright Test, live in `apps/web/e2e/`, and use page objects with role-based locators. In every PR they run on the mock stand, the panel served by Vite with every daemon request answered by the dev mocks, in the same CI job as the Vitest browser tests. A second run against a real daemon on the CI bench is decided here and tracked in issue [#226](https://github.com/mderkach/metabox/issues/226). An e2e test is the top of the test pyramid: a few scenarios that cross screens and the Apply cycle, not a replacement for component tests.

## Context and problem statement

Review fixes #198–#200 were merged without the panel being opened once, and a check on mocks afterwards found two bugs the tests missed (#201, #202). The audit in issue [#212](https://github.com/mderkach/metabox/issues/212) traced this to the definition of done: it is written through code quality, not panel behaviour. On 2026-11-13 the owner decided that frontend correctness is confirmed through Playwright and that e2e tests are introduced.

What the repository has:

- Vitest in jsdom for components and logic, and a Vitest `browser` project in Chromium for what jsdom cannot do: Base UI dropdowns, layout, axe ([ADR-0064](./ADR-0064-run-browser-tests-in-a-vitest-browser-project-next-to-jsdom.md)). Both render one component or one screen; neither navigates the assembled app through its router, query cache and the Apply cycle across screens.
- The mock stand: `METABOX_MOCK=all` makes the dev server answer every daemon endpoint with the handlers assembled by `createMissingHandlers` (`apps/web/src/test/handlers.ts`); with PR [#222](https://github.com/mderkach/metabox/pull/222) an endpoint without a mock fails with a network error instead of reaching the proxy target.
- A bench with a live daemon: the `integration` CI job starts the packaged daemon and sing-box in a disposable OpenWrt container ([ADR-0067](./ADR-0067-test-http-apply-on-the-disposable-ci-bench.md)). The job has no Node toolchain and builds the daemon without the panel.
- `playwright` 1.64.1 is a dev dependency of `apps/web` as the engine of the Vitest browser provider. OQ-6 of the [PRD](../PRD.md) chose Vitest browser mode for browser tests and left `@playwright/test` out of that decision.

In scope: the e2e runner, where scenarios live and how they are written, how the stand starts, where the runs go in CI. Out of scope: moving existing component tests, visual snapshots, a second browser engine, load measurements.

## Decision drivers

- Exercise the assembled panel the way a user does: routing, queries, the draft, the Apply dialog and confirmation window together.
- A scenario fails on a broken user flow, not on a markup change: locators follow roles and accessible names, as the unit tests already do.
- Fast and deterministic in every PR: no daemon, no shared state between tests.
- Reuse what exists: the mock handlers, the Playwright engine and its downloaded Chromium, the CI bench.
- Few new dependencies; nothing reaches the production bundle.

## Considered options

1. **Playwright Test as a separate runner in `apps/web/e2e/`. Chosen.** Built for whole-app scenarios: `webServer` starts and waits for the stand, every test gets a fresh browser context, locators and web-first assertions retry by themselves, and a trace of a failed retry shows every step with DOM snapshots and network. Page objects are injected as test fixtures. Its `@playwright/test` package is pinned to the same version as the `playwright` engine already installed, so it adds one package and no new browser download. The cost is a second test runner with its own config and assertion API next to Vitest.
2. **Extend the Vitest browser project to whole-app scenarios.** One runner and one assertion style. But Vitest browser mode runs the test file inside the page next to the component: there is no page navigation, no browser context per test, no `webServer` and no trace viewer. A scenario would render `App` into the test iframe with its own router setup and differ from the served panel exactly where the bugs of #201 and #202 were. **Rejected**: it stays the place for component-level browser checks.
3. **No e2e tests; check by hand through the Playwright MCP before a PR.** No new code to maintain. Nothing repeats the check later, it depends on the discipline of each author, and CI cannot see it. **Rejected** as the only check; kept as the way to explore a change before a scenario exists.

## Decision outcome

Playwright Test (`@playwright/test`, pinned to the installed `playwright` version, both updated together) runs end-to-end scenarios of the panel.

### Layout and style

- Config: `apps/web/playwright.config.ts`. Scenarios: `apps/web/e2e/*.e2e.test.ts`; page objects: `apps/web/e2e/pages/`, one class per screen or panel part; fixtures: one file per concern in `apps/web/e2e/fixtures/`, joined with `mergeTests` in its `index.ts`, the only module scenarios import from. The directory is outside `src`, so Vitest never collects it, and it is typed by `tsconfig.node.json`. The writing rules live in [E2E.md](../../apps/web/docs/guides/testing/E2E.md).
- A test receives page objects as fixtures, not by constructing them. A page object holds locators and user actions; assertions stay in the test, and a scenario of several steps is a sequence of `test.step`, each an action and the check of its result.
- Locators: `getByRole` with the accessible name first, then `getByLabel`, `getByText`; `getByTestId` only where there are no semantics; CSS and XPath are not used. Narrowing goes through chaining (`region.getByRole(...)`). Assertions are web-first (`await expect(locator).toBeVisible()`); manual waits and `waitForTimeout` are not used.
- The panel runs in English (`locale: 'en-US'`) with reduced motion, so a click never lands on a moving element. Panel texts are taken by dictionary key, not copied into scenarios: `e2e/lib/i18n.ts` renders them with i18next and the options the panel and the Vitest tests share (`src/shared/lib/i18nConfig.ts`), over the dictionaries `tools/i18n.ts` collects. An unknown key or a missing placeholder value fails before the scenario acts.
- Panel timers, such as the Apply confirmation window, are driven by `page.clock`; `waitForTimeout` is not used.
- An automatic fixture fails a test on an uncaught exception in the page.

### Stands and runs

Each scenario is tagged with every stand it holds on, `@mock` and `@live`; a run picks its stand with `--grep` on the command line.

- **Mock stand, every PR.** `webServer` starts Vite on its own port with `METABOX_MOCK=all`; the msw state lives in each browser context, so tests are isolated and run in parallel. CI runs `pnpm --filter web test:e2e --grep @mock` in the `web-browser` job after the Vitest browser project: the job already installs the Chromium headless shell with `--with-deps`, and both runners use that one download. The browser is not cached ([Playwright CI guide](https://playwright.dev/docs/ci): restoring the cache takes about as long as the download). On CI a failed test is retried once to record a trace, a test that passes only on the retry still fails the run (`failOnFlakyTests`), `test.only` fails the run, and the HTML report is uploaded as an artifact on failure.
- **Live daemon, `integration` job.** The scenarios tagged `@live` run against the bench daemon: Vite without mocks proxies `/api` to it, one worker because the daemon state is shared, after the dataplane check so an applied edit does not change the fixture the earlier checks use. This run checks what the mocks cannot, such as an applied edit surviving a reload. It needs Node and Chromium in that job and is tracked in [#226](https://github.com/mderkach/metabox/issues/226).

### Place in the pyramid

A unit or component test stays the default level. An e2e scenario is added for a user flow that crosses screens, the draft and the Apply cycle, or the router, when no lower level can show it broken. The mock suite is budgeted to run in a few minutes; when it grows past that, it is sharded before anything else is cut.

Non-goals: a browser matrix, visual snapshots, e2e in the pre-push hook.

## Consequences

### Positive

- A broken user flow across screens fails CI in the PR, not on the device.
- A failure in CI comes with a trace: every step, DOM snapshot and request of the failed retry.
- Locators by role and name also keep the accessible names of the panel stable, since a scenario breaks when one disappears.

### Negative

- A third test style next to jsdom and Vitest browser tests: different runner, fixtures and `expect`.
- Scenarios depend on dictionary keys: a renamed key breaks the scenario that uses it, though a reworded text does not.
- The mock stand is only as true as the mocks: the dev config handler is static, so on mocks an applied edit reverts after confirmation, and the scenario cannot check that it stayed.
- Until [#226](https://github.com/mderkach/metabox/issues/226) lands, nothing runs a browser scenario against a real daemon.
- Any install that rewrites the lockfile also moves `react-doctor`, which `react-scan` requests as `latest`; adding `@playwright/test` moved it from 0.9.18 to 0.9.22.

### Neutral or deferred

- `pnpm test` and pre-push stay without a browser, as in ADR-0064.
- Moving existing Vitest browser tests to Playwright Test is not planned.

## Compatibility, migration and rollback

No product behaviour changes, and nothing from `e2e/` reaches the bundle. Rollback: remove `@playwright/test`, `playwright.config.ts`, `e2e/`, `docs/guides/testing/E2E.md` and its row in the testing index, the `test:e2e` script, the e2e steps of the `web-browser` job and the `e2e` entries of `tsconfig.node.json`, `.oxlintrc.json` and `.gitignore`.

## Validation

- `pnpm --filter web test:e2e --grep @mock` starts the mock stand by itself and passes; `e2e/ruleApply.e2e.test.ts` renames a rule, sees the apply bar, the diff with the new comment line, confirms and sees the confirmation toast.
- `--grep` with a tag no scenario carries fails with `No tests found`.
- `pnpm --filter web build` type-checks `e2e/` and `playwright.config.ts` through `tsconfig.node.json`; `pnpm lint` covers them.
- The `web-browser` job runs the e2e step and `checks` fails when it fails.
- The live run: the checks listed in [#226](https://github.com/mderkach/metabox/issues/226).

## Links

- [PRD](../PRD.md): OQ-6 in 10.1
- [ADR-0045](./ADR-0045-split-document-and-server-state-and-keep-a-folder-per-project.md): test levels
- [ADR-0064](./ADR-0064-run-browser-tests-in-a-vitest-browser-project-next-to-jsdom.md): Vitest browser project
- [ADR-0067](./ADR-0067-test-http-apply-on-the-disposable-ci-bench.md): the CI bench
- [E2E.md](../../apps/web/docs/guides/testing/E2E.md), [Unit.md](../../apps/web/docs/guides/testing/Unit.md), [apps/web/AGENTS.md](../../apps/web/AGENTS.md)
- `apps/web/playwright.config.ts`, `apps/web/e2e/`, `.github/workflows/ci.yml`
- Issues [#212](https://github.com/mderkach/metabox/issues/212), [#226](https://github.com/mderkach/metabox/issues/226)
- Playwright best practices: <https://playwright.dev/docs/best-practices>; fixtures and page objects: <https://playwright.dev/docs/test-fixtures>
