import type { StoreApi, UseBoundStore } from 'zustand';

type Selectors<T> = { [K in keyof T]: () => T[K] };

/**
 * Состояние берётся из `getState`, а не выводится из `UseBoundStore<StoreApi<T>>`:
 * middleware меняют тип `setState`, и вывод по всему стору давал `void` вместо
 * состояния.
 */
type ExtractState<S> = S extends { getState: () => infer T } ? T : never;

type WithSelectors<S> = S & { use: Selectors<ExtractState<S>> };

/**
 * Достраивает стору `use.<поле>()` — подписку на одно поле.
 *
 * Ради неё стор и оборачивается: подписка на весь стор перерисовывает
 * компонент на любое изменение, а писать селектор руками на каждое поле —
 * шум, который со временем перестают писать.
 */
export function createReactSelectors<S extends UseBoundStore<StoreApi<object>>>(store: S): WithSelectors<S> {
  // Ключи и их типы связаны только через дженерик стора: `Object.keys` отдаёт
  // `string[]`, и сузить его до `keyof T` может лишь утверждение.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- см. выше
  const withSelectors = store as WithSelectors<S>;
  const selectors: Record<string, () => unknown> = {};

  for (const key of Object.keys(store.getState())) {
    selectors[key] = (): unknown => store((state): unknown => Reflect.get(state, key));
  }

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- та же причина
  withSelectors.use = selectors as Selectors<ExtractState<S>>;

  return withSelectors;
}
