# Работа с запросами

TanStack Query v5 поверх `fetch`. Отдельный http-клиент не заводим: бэкенд один и на том же origin, базовый URL и обработка ошибок живут в `shared/api`.

## Из чего состоит запрос

1. **fetch-функция** — знает про endpoint и DTO, ничего не знает про React;
2. **фабрика query-опций** — знает про ключ, кэш и meta;
3. **хук** — тонкая обёртка `useQuery` / `useMutation`.

Разделение нужно, чтобы те же опции можно было отдать в `queryClient.fetchQuery`, `prefetchQuery` и в тесты, не таща React.

## fetch-функция

Обязательно принимает опциональный `RequestInit` — через него Query передаёт `signal` и отменяет запрос при размонтировании.

```ts
export const CONFIG_ENDPOINT = {
  draft: () => "/api/config/draft",
  applied: () => "/api/config",
  apply: () => "/api/config/apply",
} as const

export async function getDraftConfig(init?: RequestInit): Promise<ConfigDto> {
  const response = await request<ConfigDto>(CONFIG_ENDPOINT.draft(), init)

  return response
}
```

Требования:

- тип ответа задаётся дженериком, а не выводится из `any`;
- обработка ошибок — в `request()` из `shared/api`, он бросает типизированный `ApiError`; локальный `try/catch` в fetch-функции не нужен, тосты показывает глобальный обработчик (см. ниже);
- никаких преобразований данных: функция возвращает то, что прислал сервер.

## queryKey factory

Ключи строятся от общего к частному. Общий префикс нужен для массовой инвалидации, частный — для точечной.

```ts
export const CONFIG_QUERY = {
  all: ["config"] as const,
  draft: () => [...CONFIG_QUERY.all, "draft"] as const,
  applied: () => [...CONFIG_QUERY.all, "applied"] as const,
  history: () => [...CONFIG_QUERY.all, "history"] as const,
  version: (id: string) => [...CONFIG_QUERY.history(), id] as const,
} as const
```

Строится ключ **только** через фабрику. Литеральный массив в `useQuery` — ошибка ревью: такой ключ невозможно найти при инвалидации.

## Фабрика опций и хук

```ts
export function getDraftConfigOptions() {
  return queryOptions({
    queryKey: CONFIG_QUERY.draft(),
    queryFn: ({ signal }) => getDraftConfig({ signal }),
    gcTime: CACHE_TIME.Hour,
    staleTime: CACHE_TIME.Minute,
    meta: { showError: true, errorMessageKey: "config.draft.fetchFailed" },
  })
}

export function useDraftConfig() {
  return useQuery(getDraftConfigOptions())
}
```

`gcTime` ниже `staleTime` бессмысленен.

Константы времени живут в `shared/api`:

```ts
const MINUTE = 60 * 1000

export const CACHE_TIME = {
  Minute: MINUTE,
  Hour: MINUTE * 60,
  Day: MINUTE * 60 * 24,
} as const
```

Дефолты клиента — без кэша (`staleTime: 0`, `gcTime: 0`): кэширование включается осознанно, по запросу.

## meta и глобальная обработка ошибок

Тосты не разбросаны по хукам — они выводятся в `QueryCache` / `MutationCache` на основании `meta`. Поля `meta` readonly, сообщения задаются **ключами локализации**, а не готовыми строками.

```ts
export interface QueryMeta {
  readonly showError?: boolean
  readonly showSuccess?: boolean
  readonly errorMessageKey?: string
  readonly successMessageKey?: string
}
```

```ts
export const QueryClientInstance = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 0, gcTime: 0, refetchOnWindowFocus: false },
  },
  queryCache: new QueryCache({
    onError: (error, query) => showQueryError(query.meta, error),
  }),
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) =>
      showQueryError(mutation.meta, error),
    onSuccess: (_data, _vars, _ctx, mutation) =>
      showQuerySuccess(mutation.meta),
  }),
})
```

Типизация `meta` расширяется через augmentation, а не кастами:

```ts
declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: QueryMeta
    mutationMeta: QueryMeta
  }
}
```

## Преобразование данных

Данные в кэше — то, что пришло с сервера, в первозданном виде. Всё остальное — через `select`, он не трогает кэш:

```ts
export function useOutbounds() {
  return useQuery({
    ...getDraftConfigOptions(),
    select: (data) => {
      const parsed = ConfigSchema.safeParse(data)

      return parsed.success ? toOutboundList(parsed.data) : []
    },
  })
}
```

Здесь же место валидации ответа: `safeParse` без выброса, с осмысленным поведением при провале. Схема берётся из `schema.generated.ts` или из адаптерного слоя — руками дублировать не нужно.

## Мутации и инвалидация

```ts
export function useApplyConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: applyConfig,
    meta: { showSuccess: true, successMessageKey: "config.apply.done" },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONFIG_QUERY.all })
    },
  })
}
```

- Инвалидируем максимально точным ключом, а не корнем, если знаем, что затронуто.
- Оптимистичное обновление — `onMutate` пишет в кэш и возвращает снапшот, `onError` откатывает, `onSettled` инвалидирует. Применяем там, где отклик важнее консистентности (переключение ноды на экране Proxies), но **не** в цикле Apply: там результат определяет `sing-box check` на устройстве, врать пользователю нельзя.

## Правила

- GET — `useQuery`, всё остальное — `useMutation`.
- Возврат `useQuery` не деструктурируем — это ограничивает использование объекта query дальше по коду.
- Адрес endpoint вынесен в константу и участвует в `queryKey`.
- Ручной запрос вне монтирования — `queryClient.fetchQuery(options)`, а не `enabled` плюс костыль.
- `enabled: false` и инвалидация несовместимы: выключенные запросы не инвалидируются, это надо помнить при построении цепочек.

## Что идёт мимо Query

WebSocket-потоки дашборда (трафик, список соединений) в Query **не заворачиваются** — они пишут напрямую в `RuntimeStreamState`. Причина в PRD, A.10: кэш поверх высокочастотного потока даёт устаревшие данные и лишние рендеры на 5000 соединений.

Подписка инициализируется в `app/`, обработчики живут в сегменте `api` соответствующего слайса и **обязаны возвращать функцию отписки**:

```ts
export function listenConnections(socket: WebSocket) {
  const handler = (event: MessageEvent) => {
    RuntimeStreamStateProto.getState().pushSnapshot(parseSnapshot(event.data))
  }

  socket.addEventListener("message", handler)

  return () => socket.removeEventListener("message", handler)
}
```
