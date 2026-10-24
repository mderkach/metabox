# ADR-0064. Run browser tests in a Vitest browser project next to the jsdom projects

- Status: Accepted
- Date: 2026-10-24
- Deciders: repository owner

## Context and problem statement

OQ-6 of the [PRD](../PRD.md) was closed on 2026-09-23: browser tests run in Vitest browser mode on the Playwright engine. [ADR-0045](./ADR-0045-split-document-and-server-state-and-keep-a-folder-per-project.md) lists that level as "not connected yet". The frontend suite runs in jsdom only (`apps/web/vite.config.ts`, projects `unit` and `budget`).

jsdom has no layout, no pointer events and no Web Animations, so a part of the panel cannot be checked there. Base UI dropdowns are opened and chosen through `apps/web/src/test/selectOption.ts`, which works around a deferred document `mouseup` listener and selects with the keyboard because a click on an option does nothing in jsdom. WCAG checks by a tool need computed styles. Issue [#37](https://github.com/mderkach/metabox/issues/37) asks to wire the mode, run it in CI, move the first select test to it and run axe.

In scope: where browser tests live, how they are typed, how they run locally and in CI. Out of scope: end-to-end scenarios against a live daemon on the test bench (OQ-6 keeps `@playwright/test` out), moving the existing jsdom suite, `forced-colors`.

Facts this decision rests on:

- Vitest is `5.0.1`. In Vitest 5 the Playwright provider is the `@vitest/browser-playwright` package, pinned to the same version as `vitest` by its peer dependency; `playwright` is a peer of any version.
- Vitest 5 inline projects inherit the root `test` options, and `setupFiles` arrays are merged, not replaced.
- `vitest/browser` declares its own Testing Library matchers on `vitest`'s `Assertion`. In one TypeScript program with `@testing-library/jest-dom` the two declarations collide: with a single browser test inside `tsconfig.app.json`, `tsc -b` reports `toHaveTextContent(RegExp)` errors in ten jsdom test files that never import `vitest/browser`.

## Decision drivers

- Follow OQ-6: reuse Vitest, Testing Library, msw and the existing tooling.
- Keep the jsdom suite and its run time as they are.
- No new dependencies beyond the provider and the browser engine.
- Keep `pnpm test`, `make test` and the pre-push hook working on a machine without a downloaded browser.
- Type both kinds of tests strictly without one breaking the other.

## Considered options

1. **A third inline project `browser` in `vite.config.ts`, files `*.browser.test.tsx`, own tsconfig**: the browser project sits next to `unit` and `budget`, inherits plugins and aliases, has its own setup file. The jsdom setup (`msw/node`, jsdom stubs) moves from the root into the two jsdom projects, so it is not merged into the browser one. Browser test files and their setup are excluded from `tsconfig.app.json` and typed by `tsconfig.browser.json`, which extends it. **Chosen**: one config, one runner, no duplicated Vite options; the typing collision is isolated by the file suffix.
2. **A separate `vitest.browser.config.ts`**: a config file project does not inherit the root config, so aliases, plugins and the i18n tooling would be repeated or imported, and the two configs drift. It does not solve typing: the test files still live in `src` under `tsconfig.app.json`. **Rejected**.
3. **Move the whole suite to the browser**: one environment, no jsdom workarounds. About 1,400 tests would have to be rechecked, the suite gets slower and every run needs Chromium, including pre-push. **Rejected** for now; the browser project is the place a test moves to when jsdom stops being enough.
4. **Keep jsdom only**: `selectOption` stays the only way to test dropdowns, and no WCAG check by a tool is possible. **Rejected**: contradicts OQ-6.

## Decision outcome

- `apps/web/vite.config.ts` has three projects: `unit` and `budget` run in jsdom with `src/test/setup.ts`; `browser` runs files matching `src/**/*.browser.test.{ts,tsx}` in headless Chromium through `@vitest/browser-playwright` with `src/test/browserSetup.ts`. The `unit` project excludes the browser files.
- Dependencies: `@vitest/browser-playwright` at exactly the installed `vitest` version, `playwright` pinned exactly. `@vitest/browser-playwright` and `vitest` are updated together.
- A browser test clicks and types through `userEvent` from `vitest/browser`, which drives Playwright, not through `@testing-library/user-event`, which dispatches synthetic events. It queries the DOM with `@testing-library/react` as jsdom tests do, and uses the matchers built into the browser mode, not `@testing-library/jest-dom`.
- `tsconfig.app.json` excludes `*.browser.test.tsx` and `src/test/browserSetup.ts`; `tsconfig.browser.json` extends it and includes only them. `tsc -b` checks both through `tsconfig.json` references.
- `pnpm --filter web test` (and so `make test` and pre-push) runs `unit` and `budget`; `pnpm --filter web test:browser` runs `browser`. CI runs the browser project in its own job `web-browser`, which installs the Chromium headless shell with its system libraries; `checks` depends on it.
- Non-goals: end-to-end tests against the daemon, a second browser engine, visual snapshots.

## Consequences

### Positive

- Dropdowns, layout, pointer events and computed styles can be tested with the real engine, without `selectOption`'s workarounds.
- The jsdom suite, its setup and its run time do not change; a developer without Chromium can still commit and push.
- WCAG checks by a tool become possible inside the same runner and with the same msw handlers.

### Negative

- Two test environments with different rules: interaction APIs and matchers differ between `*.test.tsx` and `*.browser.test.tsx`.
- One more tsconfig project to keep in line with `tsconfig.app.json`.
- Browser tests are not part of pre-push; a broken browser test is first seen in CI unless the developer runs `test:browser`.
- CI downloads Chromium on every run (about 100 MB, no cache yet).

### Neutral or deferred

- Which existing jsdom tests move to the browser project is decided test by test; `selectOption` stays for the remaining jsdom tests.
- Caching the Playwright browser in CI is deferred until the job time matters.

## Compatibility, migration and rollback

No product behaviour changes. Rollback: remove the `browser` project, the two dependencies, `tsconfig.browser.json`, the `web-browser` job and the `*.browser.test.tsx` files; move the jsdom options back to the root `test`.

## Validation

- `pnpm --filter web test:browser` passes and reports the `browser` project; the smoke test `src/shared/ui/__tests__/Button.browser.test.tsx` checks a non-zero layout height, which jsdom never reports.
- `pnpm --filter web test` runs only `unit` and `budget`.
- `pnpm --filter web exec tsc -b` passes with browser tests present.
- The `web-browser` job is green in CI, and `checks` fails when it fails.

## Links

- [PRD](../PRD.md), OQ-6 in 10.1
- [ADR-0045](./ADR-0045-split-document-and-server-state-and-keep-a-folder-per-project.md): test levels
- [UnitTesting.md](../../apps/web/docs/guides/UnitTesting.md)
- `apps/web/vite.config.ts`, `apps/web/tsconfig.browser.json`, `.github/workflows/ci.yml`
- Issue [#37](https://github.com/mderkach/metabox/issues/37)
- Vitest browser mode: <https://vitest.dev/guide/browser/>
