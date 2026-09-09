import type { StoreApi, UseBoundStore } from "zustand"
import { useShallow } from "zustand/react/shallow"

/**
 * Выборка нескольких полей за раз. `useShallow` сравнивает результат поверхностно,
 * иначе новый объект на каждом рендере делает подписку бесполезной.
 *
 * Для одного поля есть `State.use.<поле>()` — он короче и не создаёт объект.
 */
export function useStore<T, U>(
  store: UseBoundStore<StoreApi<T>>,
  selector: (state: T) => U
): U {
  return store(useShallow(selector))
}
