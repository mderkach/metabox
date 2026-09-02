# Управление состоянием

Zustand + immer. Почему документ конфига живёт в сторе, а не в форме или в кэше Query — [PRD, A.10](../../../docs/PRD.md).

## Зона ответственности

Стор отвечает за:

1. замену множественных `useState`;
2. замену React Context там, где он используется как транспорт данных;
3. передачу состояния между компонентами и экранами;
4. вычисляемые свойства поверх уже полученных данных;
5. состояние, которое было бы дорого держать в React Hook Form (см. [Формы](./Form&Validation.md)).

**Стор не управляет HTTP-запросами.** Запрос-ответ — зона TanStack Query. Исключение, зафиксированное в PRD: WebSocket-потоки дашборда (трафик, соединения) идут мимо Query в отдельный стор, потому что кэш поверх потока врёт.

## Три стора приложения

| Стор                  | Слой                        | Что держит                                                  |
| --------------------- | --------------------------- | ----------------------------------------------------------- |
| `ConfigDocumentState` | `entities/Config/model`     | дерево конфига, черновик, dirty-флаги, история, сырые блоки |
| `RuntimeStreamState`  | `entities/Connection/model` | живой поток соединений и трафика из WebSocket               |
| локальные             | по месту                    | состояние отдельного виджета, которое незачем поднимать     |

Больше глобальных сторов заводить не нужно. Если состояние нужно двум компонентам одного слайса — это локальный стор слайса, а не глобальный.

## Инструменты

В `shared/lib/state` лежат три обёртки:

- `stateCreator` — фабрика стора: подключает `devtools` и `immer`;
- `useStore` — подписка с `useShallow`, чтобы множественная выборка не давала лишних рендеров;
- `createReactSelectors` — генерирует `State.use.<prop>()` по ключам стора.

### Создание

```ts
import { stateCreator, createReactSelectors } from "@shared/lib/state"

interface ConfigDocumentState {
  draft: ConfigModel | null
  isDirty: boolean
  setField: (path: string, value: unknown) => void
}

const ConfigDocumentStateProto = stateCreator<ConfigDocumentState>(
  (set) => ({
    draft: null,
    isDirty: false,
    setField: (path, value) =>
      set((state) => {
        applyAtPath(state.draft, path, value)
        state.isDirty = true
      }),
  }),
  "ConfigDocument"
)

export const ConfigDocumentState = createReactSelectors(
  ConfigDocumentStateProto
)
```

Нейминг — как у компонентов. Стор с суффиксом `Proto` наружу не уходит; экспортируется результат `createReactSelectors`.

### Подписка

Единичное значение — через сгенерированный селектор, это предпочтительный вариант:

```tsx
function DirtyBadge() {
  const isDirty = ConfigDocumentState.use.isDirty()

  return isDirty ? <Badge>черновик</Badge> : null
}
```

Несколько значений — через `useStore`, он мемоизирует выборку по `shallow`:

```tsx
function ApplyBar() {
  const { isDirty, draft } = useStore(ConfigDocumentStateProto, (state) => ({
    isDirty: state.isDirty,
    draft: state.draft,
  }))

  return <div>...</div>
}
```

### Вне React

Прямой доступ к состоянию — через `getState()` / `setState()` на `*Proto`. Так работают, например, обработчики WebSocket, живущие вне дерева компонентов.

## Запрещено

**Подписка на весь стор.** Любое изменение вызовет рендер:

```tsx
const state = useStore(ConfigDocumentStateProto, (s) => s) // ❌
```

**Вызов вычисляющего экшена вместо селектора.** Подписка не сработает, ререндера не будет:

```tsx
// ❌ ререндера не будет
const calc = useStore(StateProto, (state) => state.calcTotal)
const total = calc()

// ✅
const total = useStore(StateProto, (state) => state.calcTotal())
```

**Избыточные множественные селекторы.** Если компонент выбирает восемь полей — скорее всего, его надо разбить.

## Полезные рецепты zustand

1. [No-action сторы](https://zustand.docs.pmnd.rs/guides/practice-with-no-store-actions)
2. [Слайсы стора](https://zustand.docs.pmnd.rs/guides/slices-pattern) — под документ конфига, чтобы черновик, история и dirty-tracking были разными файлами
3. [Map и Set](https://zustand.docs.pmnd.rs/guides/maps-and-sets-usage) — под индекс соединений по id
4. [Сброс состояния](https://zustand.docs.pmnd.rs/guides/how-to-reset-state) — при смене устройства или перезагрузке конфига
