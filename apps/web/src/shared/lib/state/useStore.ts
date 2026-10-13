import type { StoreApi, UseBoundStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

/**
 * Selecting several fields at once. `useShallow` compares the result shallowly,
 * otherwise a new object on every render makes the subscription useless.
 *
 * For a single field there is `State.use.<field>()` — it is shorter and does not create an object.
 */
export function useStore<T, U>(store: UseBoundStore<StoreApi<T>>, selector: (state: T) => U): U {
  return store(useShallow(selector));
}
