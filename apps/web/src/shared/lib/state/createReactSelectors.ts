import type { StoreApi, UseBoundStore } from 'zustand';

type Selectors<T> = { [K in keyof T]: () => T[K] };

/**
 * State is taken from `getState`, not inferred from `UseBoundStore<StoreApi<T>>`:
 * middleware changes the `setState` type, and inference over the whole store gave `void` instead of
 * the state.
 */
type ExtractState<S> = S extends { getState: () => infer T } ? T : never;

type WithSelectors<S> = S & { use: Selectors<ExtractState<S>> };

/**
 * Adds `use.<field>()` to a store — a subscription to a single field.
 *
 * This is what the store is wrapped for: a subscription to the whole store rerenders
 * the component on any change, and writing a selector by hand for every field is
 * noise that people eventually stop writing.
 */
export function createReactSelectors<S extends UseBoundStore<StoreApi<object>>>(store: S): WithSelectors<S> {
  // Keys and their types are linked only through the store generic: `Object.keys` returns
  // `string[]`, and only an assertion can narrow it to `keyof T`.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see above
  const withSelectors = store as WithSelectors<S>;
  const selectors: Record<string, () => unknown> = {};

  for (const key of Object.keys(store.getState())) {
    selectors[key] = (): unknown => store((state): unknown => Reflect.get(state, key));
  }

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- same reason
  withSelectors.use = selectors as Selectors<ExtractState<S>>;

  return withSelectors;
}
