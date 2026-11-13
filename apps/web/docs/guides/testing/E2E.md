# End-to-end scenarios

Playwright Test runs whole user flows in the served panel. Why a separate runner, which stands and where the runs go: [ADR-0075](../../../../../docs/adr/ADR-0075-run-end-to-end-scenarios-with-playwright-test-on-the-mock-stand-and-the-live-daemon.md). Which flows get a scenario: [the testing index](./README.md#choosing-a-level).

## Layout

```text
e2e/
├── fixtures/
│   ├── index.ts        # mergeTests of the files below, expect, E2E_TAG
│   ├── pages.ts        # page objects as fixtures
│   └── pageErrors.ts   # fails a test on an uncaught page exception
├── lib/
│   └── i18n.ts         # translate: panel text by dictionary key
├── pages/              # page objects, one class per screen or panel part
└── *.e2e.test.ts       # scenarios
```

The config is `playwright.config.ts`; the directory is typed by `tsconfig.node.json` and linted with the rest of `apps/web`.

## Fixtures and page objects

- One fixture file per concern in `e2e/fixtures/`. A file exports its own `test`, extended from `@playwright/test`, or from another fixture file when it needs that file's fixture. `index.ts` joins them with `mergeTests` and exports `expect`; scenarios import only from `index.ts`. A new fixture is a new file and a line in `mergeTests`.
- A scenario takes page objects as fixtures and does not construct them.
- A page object holds locators and user actions. Locators are declared in the page object and the scenario uses its fields; assertions stay in the scenario.

## Locators

- `getByRole` with the accessible name first, then `getByLabel`, then `getByText`. `getByTestId` only for an element with no semantics.
- No CSS classes (Tailwind changes with any layout edit), no position in the DOM (`nth`, `first()`, chains of descendants, XPath). An item of a list is found by its name from the scenario data, not as the first one.
- An element without a role or an accessible name is a gap in the panel's accessibility: fix it in the component. Production code is not changed for e2e otherwise.
- Narrow by chaining from a region or a dialog: `applyBar.region.getByRole('button', …)`.

## Texts

The stand runs in English (`locale: 'en-US'`). A panel text is taken by its dictionary key with `translate` from `e2e/lib/i18n.ts`, not written as a string in the scenario: `translate('features/Config/ConfigApply', 'bar.dirty')`. The namespace is the slice path under `src`, as in i18next. The text is rendered by i18next with the panel's own options (`I18N_OPTIONS` from `src/shared/lib/i18nConfig.ts`) over the dictionaries `tools/i18n.ts` collects, so plurals and placeholders come out as the panel shows them. An unknown key or a missing placeholder value throws before the scenario acts. A string is written only for user data: a rule name, a domain, a line of config.

## Structure of a scenario

- Arrange, act, assert. Setup (data, mocks, opening the screen) is in a fixture or at the start of the test; then a user action and the check of its result; blocks are separated by an empty line.
- A scenario of several steps wraps each in `test.step`, and each step is an action followed by the check of its result. The trace and the report then show the scenario by steps.

## Waiting

- Assertions are web-first and awaited: `await expect(locator).toBeVisible()`. `isVisible()` and other one-shot checks do not retry and are not used for assertions.
- State outside the DOM, such as the draft in `localStorage`: `expect.poll`.
- A panel timer (the Apply confirmation window, polling, a debounce): `page.clock`, advanced exactly to the threshold. A scenario does not wait real time.
- `waitForTimeout` is not used.

## Stands and tags

Each scenario carries the tag of every stand it holds on: `E2E_TAG.Mock` for the mock stand (`METABOX_MOCK=all`), `E2E_TAG.Live` for the CI bench daemon. A run picks its stand with `--grep` on the command line, not with `grep` in the config; a filter that matches no scenario fails the run.

- The mock stand keeps its state in each browser context, so scenarios on it are isolated and run in parallel. The dev config handler is static: after Apply is confirmed the mock config reverts, so a scenario on mocks does not check that an edit stayed.
- A scenario on the live daemon finds its data by name and does not depend on the mock fixture. Data the bench lacks makes a fixture fail with what to fix; the scenario is not skipped, because a skip turns an unchecked flow green.

## Failures and flakiness

- An uncaught page exception fails the test through the automatic `noPageErrors` fixture.
- On CI a failed test is retried once to record a trace; a test that passes only on the retry still fails the run (`failOnFlakyTests`). The HTML report with the trace is uploaded as the `playwright-report` artifact of the `web-browser` job.

## Commands

```bash
pnpm --filter web test:e2e                  # all scenarios, the mock stand starts by itself
pnpm --filter web test:e2e --grep @mock     # the mock stand only, as in CI
pnpm --filter web test:e2e --ui             # UI mode
pnpm --filter web exec playwright show-report
```

Before the first local run, download the browser: `pnpm --filter web exec playwright install --only-shell chromium`. A dev server already running on the stand port is reused locally, never on CI.
