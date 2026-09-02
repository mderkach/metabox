# Тестирование фронтенда

Vitest + Testing Library. Уровни тестов и что каждый закрывает — в [PRD, A.10](../../../docs/PRD.md).

## Размещение и именование

Тесты лежат рядом с кодом, внутри слайса:

```
entities/Rule/
├── api/
├── model/
├── ui/
└── __tests__/
    ├── Rule.api.test.ts
    ├── Rule.schema.test.ts
    └── RuleRow.test.tsx
```

- Имя файла: `<ТестируемыйФайл>.test.<ts|tsx>` — под `include: ["src/**/*.test.{ts,tsx}"]` из `vite.config.ts`.
- Названия тестов — на русском, читаются как спецификация: `it("отклоняет пустой домен")`.
- Группировка по компоненту/функции через `describe`.

Vitest-глобалы **выключены** (`globals: false`): `describe`, `it`, `expect`, `vi` импортируются явно из `vitest`. Поэтому `cleanup` из Testing Library зарегистрирован вручную в `src/test/setup.ts` — не дублировать его в тестах. По той же причине в линте выключено `testing-library/no-manual-cleanup`: правило рассчитано на автоочистку, которой здесь нет.

## Методология

- **Тестируем поведение, а не реализацию.** Проверяем DOM по ролям и доступным именам, публичные эффекты, контракты. Внутреннее состояние компонента — не предмет теста.
- **Мокаем по границам.** Сеть, роутер, сторонние виджеты. Собственную бизнес-логику не мокаем.
- **Каждый тест изолирован.** Свой `QueryClient` на тест, `retry: false`, нулевой кэш.
- **Минимум завязок на CSS.** Приоритет — роли и `data-testid`, не классы Tailwind: они меняются при любой правке верстки.
- **Снапшоты не используем.** Исключение — статичные структуры: сгенерированные схемы, наборы ключей.
- **Берём настоящие константы и схемы проекта**, а не их копии в тесте.

## Компоненты

```tsx
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { RuleRow } from "../ui/RuleRow"

describe("RuleRow", () => {
  it("вызывает обработчик при клике по строке", async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()

    render(<RuleRow rule={RULE_FIXTURE} onSelect={onSelect} />)
    await user.click(screen.getByRole("button", { name: "Правило 1" }))

    expect(onSelect).toHaveBeenCalledWith(RULE_FIXTURE.id)
  })
})
```

Приоритет запросов: `getByRole` → `getByLabelText` → `getByText` → `getByTestId`. Последний — когда семантики нет.

Важно про shadcn: `CardTitle` рендерится как `<div data-slot="card-title">`, а не как заголовок. Роль `heading` там не найдётся — проверяем по тексту или ставим семантический тег явно.

## Моки

```tsx
vi.mock("@entities/Config", () => ({
  useDraftConfig: vi.fn(() => ({ data: CONFIG_FIXTURE, isPending: false })),
}))
```

`vi.mock` поднимается наверх файла — объявлять до импорта тестируемого модуля. Очистка — `vi.clearAllMocks()` в `beforeEach`.

## Логика, схемы, сторы

**Zod-схемы:** позитивные примеры, негативные (пустая строка, неверный тип, краевые значения), поведение трансформов и адаптеров.

**Zustand:** слайс тестируется изолированно — начальное состояние, экшены, селекторы. Стор между тестами сбрасывается, иначе тесты начнут зависеть от порядка.

**Константы и фабрики ключей:** проверяем форму ключа, а не значение:

```ts
it("строит ключ версии от корня истории", () => {
  expect(CONFIG_QUERY.version("42")).toEqual(["config", "history", "42"])
})
```

## TanStack Query

Следуем [официальному гайду](https://tanstack.com/query/latest/docs/framework/react/guides/testing). Общая обёртка рендера с новым `QueryClient` на тест живёт в `src/test`:

```tsx
export function renderWithQuery(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })

  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  )
}
```

Покрываем: success, error, попадание в кэш, инвалидацию после мутации.

## React Hook Form

Тестируем поведение формы, а не её внутренности: ввод, blur, submit, тексты ошибок, состояние кнопки отправки. Взаимодействие — через `user-event`, валидация — через реальный `zodResolver`, не через мок.

## Golden round-trip

Отдельный, самый важный класс тестов (AC-1…AC-3): набор реальных `config.json` парсится и сериализуется обратно, диф обязан быть пустым. Это основная защита адаптерного слоя от регрессий — фикстуры складываем в `src/adapters/__tests__/fixtures/` и пополняем каждый раз, когда всплывает новый формат в поле.

## Покрытие

Ориентиры, не жёсткие ворота CI:

| Зона                           | Порог  |
| ------------------------------ | ------ |
| `adapters`, `model`, Zod-схемы | ≥ 90%  |
| сторы zustand                  | ≥ 85%  |
| query-хуки                     | ≥ 80%  |
| `ui` фич и виджетов            | 60–70% |

## Команды

```bash
pnpm -C web test              # прогон
pnpm -C web test:watch        # watch
pnpm -C web test -- Rule      # по подстроке пути
make test                     # Go + фронт
```
