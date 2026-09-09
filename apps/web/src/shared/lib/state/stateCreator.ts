import { create, type StateCreator } from "zustand"
import { devtools } from "zustand/middleware"
import { immer } from "zustand/middleware/immer"

/**
 * Набор middleware, общий для всех сторов приложения: `immer` — чтобы правка
 * вложенного узла конфига писалась как присваивание, `devtools` — чтобы шаги
 * применения было видно в расширении.
 */
type Middlewares = [["zustand/devtools", never], ["zustand/immer", never]]

/**
 * Фабрика стора. Собирается здесь, а не на месте, чтобы набор middleware не
 * разъезжался между сторами: `devtools` без имени сливает их в один поток.
 *
 * `name` виден в Redux DevTools и должен совпадать с ролью стора
 * (`ConfigDocument`, `ConnectionStream`).
 */
export function stateCreator<T extends object>(
  initializer: StateCreator<T, Middlewares>,
  name: string
) {
  return create<T>()(
    devtools(immer(initializer), { name, enabled: import.meta.env.DEV })
  )
}
