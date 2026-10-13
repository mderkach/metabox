# Code review checklist

The rules of the [Architecture and style guide](./Architecture&Style.md), collected into a checklist. An exception is recorded with a comment in the code.

Only what a human checks. Layer boundaries, file and folder naming, `any`, unsafe casts, floating promises, forbidden types, Tailwind classes, correctness of ARIA roles and labels, destructuring of a query result and DOM access in tests are covered by `pnpm lint`; the source of the rules is `apps/web/.oxlintrc.json`.

## Architecture

- [ ] `index.ts` contains only re-exports
- [ ] Code is split into the `ui` / `api` / `model` / `lib` segments
- [ ] Related slices are grouped into a folder
- [ ] UI components in `shared` have no domain state
- [ ] Complex component logic is moved into a hook: with a domain rule, into `model`; screen composition without domain knowledge, into `lib`
- [ ] A user scenario is handled by `features/*`, the page only composes
- [ ] The model is created by the owning slice, not by a form or a component
- [ ] Branching by node type is a "type → component" table, not an `if` chain
- [ ] A module with no counterpart in the domain lives in `shared`, not in `entities`

## Style

- [ ] A memoized component has the `Proto` suffix, `memo(Proto)` is what is exported
- [ ] Constants are in `SCREAMING_SNAKE_CASE`, grouped ones are an object with keys in `PascalCase`
- [ ] No magic strings; anything repeated more than twice is moved into a constant
- [ ] Custom logs are in upper case and in brackets: `[APPLY] ...`

## Maintainability

- [ ] `TODO` / `FIXME` come with an explanation and a link to the task
- [ ] Linter rule suppressions are targeted and have a reason; a cast in adapters is covered by `oxlint-disable-next-line` with an explanation
- [ ] No stubs passed off as an implementation: empty branches, "return a mock for now"

## Performance

- [ ] Function calls are moved out of the render body
- [ ] `memo` is used where it saves something (lists, tree nodes), not everywhere
- [ ] Functions in `props` of a memoized component are wrapped in `useCallback`
- [ ] A `props` spread is deliberate
- [ ] Unsubscribing happens in the `useEffect` cleanup

## State

- [ ] The store does not go to the network
- [ ] No subscription to the whole store
- [ ] A computed value is taken by a selector, not by calling an action after subscribing
- [ ] The number of selected fields in a component is reasonable
- [ ] A store with selectors is declared as `*Proto`, the result of `createReactSelectors` is what is exported
- [ ] The draft is not filled with default values
- [ ] An unrecognized node is kept without normalization
- [ ] The diff is computed by a selector, not stored in a field
- [ ] Stream snapshots are applied in a batch, not on every message

## Requests

- [ ] GET goes through `useQuery`, everything else through `useMutation`
- [ ] The fetch function is separate from the hook and takes an `AxiosRequestConfig` with `signal`
- [ ] `queryKey` is built by a factory, not a literal
- [ ] The endpoint address is moved into a constant
- [ ] `gcTime` and `staleTime` are set, and `gcTime` is not lower than `staleTime`
- [ ] The response type is passed as a generic
- [ ] Transformations happen in `select`, the cache is not mutated
- [ ] After a mutation, invalidation runs with an exact key
- [ ] Error and success texts are set in `meta` as keys of the `shared` namespace, not as strings
- [ ] A runtime stream topic is not wrapped in Query; the handler takes a `StreamSource` and returns an unsubscribe function
- [ ] Mutations are not retried, Apply is not repeated automatically
- [ ] Polling is stopped on a hidden tab
- [ ] Daemon unavailability and a sing-box error are separate screen states

## Forms

- [ ] The form has a model derived from a Zod schema
- [ ] `useFormContext` is called with the model generic
- [ ] Fields are registered through `Controller`
- [ ] Field paths are written in dot notation
- [ ] The form is typed against the node type, not the whole config
- [ ] A mismatch between UI and DTO is resolved by an adapter schema, not by mapping on submit
- [ ] `.transform()` did not get into a generated schema
- [ ] When a list gets a form: it is built with `useFieldArray`, the row key is `field.id`. For now lists are edited by document patches in the store
- [ ] Submit does not send empty values and defaults
- [ ] Raw mode writes changes as one patch, a parse error does not erase the text
- [ ] When parsing of `sing-box check` output appears: a parsed error is attached to the field of its node. For now the output is shown in full in the apply bar

## Texts

- [ ] New text lives in the `i18n` of its slice, not as a string in code
- [ ] The component calls `useTranslation` with its own namespace
- [ ] Toast text lives in the `shared` namespace, not in the slice dictionary
- [ ] A new namespace is loaded by the route loader or the app entry
- [ ] A numeral is built with i18next pluralization, not by choosing the form in code
- [ ] A phrase with markup is built with `<Trans>`, not by gluing several `t()` together
- [ ] New text is added to all languages: a key mismatch fails the build

## Styles

- [ ] Conditional classes are built with `cn()`
- [ ] Component variants are defined with `cva`
- [ ] Images are responsive
- [ ] No new `.css` files appeared

## Tests

- [ ] The test checks behaviour, not implementation
- [ ] The test is isolated: its own `QueryClient`, a reset store, cleared mocks
- [ ] A new Zod schema has positive and negative cases
- [ ] A change in adapters comes with a golden round-trip fixture
- [ ] Timers in tests are fake, there are no real delays
- [ ] A virtualized list is tested with a size mock
