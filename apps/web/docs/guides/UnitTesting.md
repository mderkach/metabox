# Frontend testing

Vitest + Testing Library. Tests run in jsdom; those that need a real browser run in Chromium in the `browser` project ([ADR-0064](../../../../docs/adr/ADR-0064-run-browser-tests-in-a-vitest-browser-project-next-to-jsdom.md)).

## Layout and naming

Tests sit next to the code, inside the slice:

```text
entities/Rule/
├── api/
├── model/
├── ui/
└── __tests__/
    ├── Rule.api.test.ts
    ├── Rule.schema.test.ts
    └── RuleRow.test.tsx
```

Not only the test sits next to the code: fixtures, stubs and MSW handlers of the same slice live in its `__tests__`, not in a shared directory. They do **not** get into the slice's Public API: through the barrel they would be pulled in by production code too, and `msw` with them. They are imported by a direct path, and such an import is allowed only to tests; for everything else a neighbour's `__tests__` is closed just like any other slice internals:

```ts
// widgets/RouteExplanation/__tests__/RouteExplanation.test.tsx
import { ROUTE_EXPLANATION_FIXTURE } from '@entities/Route/__tests__/Route.fixture';
```

For the same reason a test may use the Public API of a neighbouring slice of its own layer: a mock drives a scenario across several slices at once; the apply cycle lives in the daemon mocks together with the config rollback endpoint. For production code this rule still applies.

`src/test` keeps only tooling without domain knowledge: `setup`, render wrappers with `QueryClient` and the router, the virtualizer size override, the runtime stream override (`fakeEventSource`), the chart override (`fakePlot`), the test dictionary, the list selection helper, the end-of-transition helpers for the side panel and the apply bar (`finishSidePanelTransition`, `finishApplyBarTransition`: jsdom does not play transitions), the MSW server instance and the handler assembly point for dev mode. A fixture of a specific API never moves there.

- File name: `<TestedFile>.test.<ts|tsx>`, matching `include: ["src/**/*.test.{ts,tsx}"]` from `vite.config.ts`. A browser test is `<TestedFile>.browser.test.tsx`.
- Test titles are in English and read as a specification: `it("rejects an empty domain")`.
- Grouping by component/function through `describe`.

Vitest globals are **disabled** (`globals: false`): `describe`, `it`, `expect`, `vi` are imported explicitly from `vitest`. For this reason the Testing Library `cleanup` is registered manually in `src/test/setup.ts`; do not duplicate it in tests. The `testing-library/no-manual-cleanup` rule assumes automatic cleanup, which is not used here, and is not enabled in the set.

## Methodology

- **Test behaviour, not implementation.** Check the DOM by roles and accessible names, public effects, contracts. The internal state of a component is not a subject of a test.
- **Mock at the boundaries.** Network, router, third-party widgets. Do not mock our own business logic.
- **Each test is isolated.** Its own `QueryClient` per test, `retry: false`, zero cache.
- **Minimum coupling to CSS.** Query by roles and accessible names, not by Tailwind classes: they change with any layout edit. Checking a class is allowed where the class itself is the subject of the test: this is how the border of a link styled as a button is pinned.
- **We do not use snapshots.** The exception is static structures: generated schemas, key sets.
- **Use the project's real constants and schemas**, not their copies in the test.

## Components

The accessible name `'Правило 1'` (Rule 1) below is Russian because the panel UI renders it that way.

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RuleRow } from '../ui/RuleRow';

describe('RuleRow', () => {
  it('calls the handler on a row click', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();

    render(<RuleRow rule={RULE_FIXTURE} onSelect={onSelect} />);
    await user.click(screen.getByRole('button', { name: 'Правило 1' }));

    expect(onSelect).toHaveBeenCalledWith(RULE_FIXTURE.id);
  });
});
```

Query priority: `getByRole` → `getByLabelText` → `getByText` → `getByTestId`. The last one only when there are no semantics.

shadcn: `CardTitle` renders as `<div data-slot="card-title">`. It has no `heading` role: query by text or set a semantic tag explicitly.

## Mocks

The network is mocked with msw, not by replacing modules: handlers live in the `__tests__` of their slices and are assembled in `src/test`. In the panel `vi.mock` is applied to two external libraries. The first is toasts, to check that a toast was shown:

```ts
vi.mock('sonner', () => ({
  toast: { error: vi.fn<(text: string) => void>(), success: vi.fn<(text: string) => void>() },
}));
```

The second is uPlot, globally in `src/test/setup.ts`: jsdom has no canvas, `getContext` returns `null`, and the real chart fails in the constructor. `FakePlot` records calls (`setData`, `setScale`, `destroy`) and computes axis labels with the same functions that the chart gave (`axisLabels`): the test checks scales and labels, not pixels.

`vi.mock` is hoisted to the top of the file: declare it before importing the module under test. Cleanup: `vi.clearAllMocks()` in `beforeEach`. Replacing our own slices is forbidden: that is already checking implementation, not behaviour.

## Logic, schemas, stores

**Zod schemas:** positive examples, negative ones (empty string, wrong type, edge values), behaviour of transforms and adapters.

**Zustand:** a slice is tested in isolation: initial state, actions, selectors. The store is reset between tests, otherwise tests start to depend on order.

**Constants and key factories:** check the shape of the key, not the value:

```ts
it('builds the history key from the config root', () => {
  expect(CONFIG_QUERY.history()).toEqual(['config', 'history']);
});
```

## TanStack Query

Follow the [official guide](https://tanstack.com/query/latest/docs/framework/react/guides/testing). The shared render wrapper with a new `QueryClient` per test lives in `src/test`:

```tsx
export function renderWithQuery(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}
```

Cover: success, error, cache hit, invalidation after a mutation.

## React Hook Form

Test the form's behaviour, not its internals: input, blur, submit, error texts, the submit button state. Interaction goes through `user-event`, validation through the real `zodResolver`, not through a mock.

## Golden round trip

A set of real `config.json` files is parsed, edited at specific points and compared with the original text: there is no reverse build, an edit is applied to the original bytes (ADR-0004), and there is nothing to serialize. The test checks that every file parses, that the number of rules in the text and in the model match, and that editing one field does not touch key order, line breaks, comments and unknown nodes. This is the main protection of config parsing against regressions. The corpus lives in `entities/Config/__tests__/corpus/` and is extended with every new format from the field.

## Timers and streams

- Polling, the Apply confirmation window and stream throttling: `vi.useFakeTimers()` and `await vi.advanceTimersByTimeAsync(ms)`. Waiting for time is not imitated by a real delay: a test that waits a second really waits it.
- A tick of the real clock between fake clock steps is an exception, and it is needed: msw responses and React's deferred render run outside the replaced timers, so `advanceTimersByTimeAsync` alone does not reach them. The reference to the real `setTimeout` is captured **before** the replacement (`ConfigApplyBar.test.tsx`), otherwise it turns out fake too.
- The runtime stream is replaced with `fakeEventSource` from `src/test`: the test sends topic frames and checks the store state, not the handler internals. The handler takes a `StreamSource`, so there is no need to imitate the `EventSource` protocol; jsdom has none at all.
- Virtualized lists: jsdom does not compute sizes, the container and row heights are supplied by a mock, otherwise zero elements render.
- Dropdowns: a new select test goes to the browser project (below) and opens and picks with the mouse. The jsdom tests that still have dropdowns go through `selectOption` from `src/test`; do not reproduce it by hand: the Base UI popup has two pitfalls in jsdom, and both are described in the helper's TSDoc.

## Browser tests

A test goes to the `browser` project when jsdom cannot reproduce what it checks: Base UI dropdowns and other pointer interactions, layout and sizes, computed styles, accessibility checks by a tool. The rest stays in jsdom: it is faster and needs no browser.

- The file is `*.browser.test.tsx` next to the jsdom tests of the same slice. It is typed by `tsconfig.browser.json`: the browser mode declares its own matchers, and in one program with `@testing-library/jest-dom` they break the types of jsdom tests.
- Clicks and typing go through `userEvent` from `vitest/browser`: it drives Playwright, so the click is a real mouse click. `@testing-library/user-event` dispatches synthetic events and is not used here. A dropdown is opened by a click on the trigger and an option is picked by a click on it (`ConfigNodeAddManual.browser.test.tsx`), without `selectOption`.
- Queries are the same Testing Library `screen` queries; matchers are the browser mode's own, `@testing-library/jest-dom` is not loaded.
- `src/test/browserSetup.ts` loads the panel styles and the test dictionary. The jsdom stubs and `msw/node` from `setup.ts` are not there.
- The network is mocked by the msw service worker (`msw/browser`); the browser project serves its script the same way the dev server does with mocks.
- The WCAG 2.2 AA check is `App.axe.browser.test.tsx`: axe-core runs in the page over Overview, Editor, Rule sets, Connections and Proxies in both themes, with the dev mock data (`createMissingHandlers`). A violation that is not fixed yet is listed in its `KNOWN_VIOLATIONS` with the number of failing elements; the test fails on any other set, so a fix also removes its line.

## Autorenderer

The test starts from the schema: a fixture with a set of node types → the expected set of widgets and labels. Checked: widget choice by type, field requiredness and the path the form passes up.

## Coverage

Targets, not hard CI gates:

| Area                          | Threshold |
| ----------------------------- | --------- |
| schemas and adapters, `model` | ≥ 90%     |
| zustand stores                | ≥ 85%     |
| query hooks                   | ≥ 80%     |
| `ui` of features and widgets  | 60–70%    |

## Commands

Running tests and the other checks: the table in [`CONTRIBUTING.md`](../../../../CONTRIBUTING.md). Specific to writing tests:

```bash
pnpm --filter web test:watch     # watch
pnpm --filter web test -- Rule   # by path substring
pnpm --filter web test:browser   # the browser project
```

`test` and the pre-push hook run only the jsdom projects; the browser project runs in the `web-browser` CI job. Before the first local run, download the browser: `pnpm --filter web exec playwright install --only-shell chromium`.
