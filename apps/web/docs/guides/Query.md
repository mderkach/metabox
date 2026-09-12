# Работа с запросами

TanStack Query v5 поверх axios. Транспорт закрыт врапперем `ApiClient` в `shared/api`: он держит таймаут, приводит отказ транспорта к доменному `ApiError` и отдаёт наружу тело ответа, а не конверт.

Ретраев в клиенте нет: ими заведует Query, и второй слой повторов запустил бы на устройстве второй цикл применения. Таймаут, наоборот, живёт только в клиенте — у `fetch` его нет вовсе, и зависший демон держал бы запрос до закрытия вкладки.

## Из чего состоит запрос

1. **fetch-функция** — знает про endpoint и DTO, ничего не знает про React;
2. **фабрика query-опций** — знает про ключ, кэш и meta;
3. **хук** — тонкая обёртка `useQuery` / `useMutation`.

Разделение нужно, чтобы те же опции уходили в `queryClient.fetchQuery`, `prefetchQuery` и в тесты без React.

## fetch-функция

Обязательно принимает опциональный `AxiosRequestConfig` — через него Query передаёт `signal` и отменяет запрос при размонтировании.

```ts
export const CONFIG_ENDPOINT = {
  draft: () => '/api/config/draft',
  applied: () => '/api/config',
  apply: () => '/api/config/apply',
} as const;

export async function getDraftConfig(config?: AxiosRequestConfig): Promise<ConfigDto> {
  return ApiClientInstance.get<ConfigDto>(CONFIG_ENDPOINT.draft(), config);
}
```

Требования:

- тип ответа задаётся дженериком, а не выводится из `any`;
- обработка ошибок — в `ApiClient`, он бросает типизированный `ApiError`; локальный `try/catch` в fetch-функции не нужен, тосты показывает глобальный обработчик (см. ниже);
- никаких преобразований данных: функция возвращает то, что прислал сервер. Разбирает ответ схемой фабрика опций — до того, как он ляжет в кэш.

## Разбор ответа

Ответ разбирается схемой слайса в `queryFn` фабрики опций, и в кэш ложится модель:

```ts
queryFn: async ({ signal }) => toRouteExplanation(await getRouteExplanation(id, { signal })),
```

`select` для этого не годится: он меняет то, что видит хук, но не то, что лежит в кэше. При разборе в `select` чужая форма остаётся в кэше, и `getQueryData` по тому же ключу вернёт её любому слою, а `setQueryData` — запишет.

Непонятый ответ становится `ApiError` вида `Schema` (`decodeResponse` в `shared/api`). Повторов у него нет: форма ответа от второго запроса не меняется. Транспорт такую ошибку не рождает — она приходит с границы слайса, поэтому `status` и `code` у неё пусты, а разбор ошибки лежит в `details`.

## queryKey factory

Ключи строятся от общего к частному. Общий префикс нужен для массовой инвалидации, частный — для точечной.

```ts
export const CONFIG_QUERY = {
  all: ['config'] as const,
  draft: () => [...CONFIG_QUERY.all, 'draft'] as const,
  applied: () => [...CONFIG_QUERY.all, 'applied'] as const,
  history: () => [...CONFIG_QUERY.all, 'history'] as const,
  version: (id: string) => [...CONFIG_QUERY.history(), id] as const,
} as const;
```

Ключ строится **только** фабрикой: литеральный массив в `useQuery` не найти при инвалидации.

## Фабрика опций и хук

```ts
export function getDraftConfigOptions() {
  return queryOptions({
    queryKey: CONFIG_QUERY.draft(),
    queryFn: ({ signal }) => getDraftConfig({ signal }),
    gcTime: CACHE_TIME.Hour,
    staleTime: CACHE_TIME.Minute,
    meta: { showError: true, errorMessageKey: 'config.draft.fetchFailed' },
  });
}

export function useDraftConfig() {
  return useQuery(getDraftConfigOptions());
}
```

`gcTime` ниже `staleTime` бессмысленен.

Константы времени живут в `shared/api`:

```ts
const MINUTE = 60 * 1000;

export const CACHE_TIME = {
  Minute: MINUTE,
  Hour: MINUTE * 60,
  Day: MINUTE * 60 * 24,
} as const;
```

Дефолты клиента — без кэша (`staleTime: 0`, `gcTime: 0`): кэширование включается осознанно, по запросу.

## meta и глобальная обработка ошибок

Тосты не разбросаны по хукам — они выводятся в `QueryCache` / `MutationCache` на основании `meta`. Поля `meta` readonly, сообщения задаются **ключами локализации**, а не готовыми строками.

```ts
export interface QueryMeta {
  readonly showError?: boolean;
  readonly showSuccess?: boolean;
  readonly errorMessageKey?: string;
  readonly successMessageKey?: string;
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
    onError: (error, _vars, _ctx, mutation) => showQueryError(mutation.meta, error),
    onSuccess: (_data, _vars, _ctx, mutation) => showQuerySuccess(mutation.meta),
  }),
});
```

Типизация `meta` расширяется через augmentation, а не кастами:

```ts
declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: QueryMeta;
    mutationMeta: QueryMeta;
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
      const parsed = ConfigSchema.safeParse(data);

      return parsed.success ? toOutboundList(parsed.data) : [];
    },
  });
}
```

Здесь же место валидации ответа: `safeParse` без выброса, с осмысленным поведением при провале. Схема берётся из `@shared/api/generated` или из `model`-сегмента своего слайса — руками дублировать не нужно.

## Мутации и инвалидация

```ts
export function useApplyConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: applyConfig,
    meta: { showSuccess: true, successMessageKey: 'config.apply.done' },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONFIG_QUERY.all });
    },
  });
}
```

- Инвалидируем максимально точным ключом, а не корнем, если знаем, что затронуто.
- Оптимистичное обновление — `onMutate` пишет в кэш и возвращает снапшот, `onError` откатывает, `onSettled` инвалидирует. Применяем там, где отклик важнее консистентности (переключение ноды на экране Proxies), но **не** в цикле Apply: там результат определяет `sing-box check` на устройстве, врать пользователю нельзя.

## Отказы и недоступность

Панель обязана работать при остановленном sing-box (NFR-1), поэтому ошибки разделены:

- `ApiError` различает «демон не ответил» и «демон ответил ошибкой». Первое — отказ панели, второе — данные экрана. К первому клиент относит и оборванный запрос, и истёкший таймаут, и шлюзовые статусы 502/503/504: их выставляет посредник между браузером и демоном, а не сам демон.
- Отмена запроса отказом не считается: её порождает сам Query при размонтировании, и клиент пропускает её как есть — иначе баннер недоступности мигал бы на каждом переходе между экранами.
- Состояние сервиса — обычный запрос, а не ошибка: экран рисует «сервис лежит» и оставляет доступным редактор.
- Баннер недоступности демона живёт в `app/`, экраны его не дублируют.
- `isPending` — скелетон блока; экран целиком не блокируется.

## Опрос и таймеры

- Статус сервиса и ход цикла Apply опрашиваются `refetchInterval`; интервал — константа рядом с фабрикой ключа.
- На скрытой вкладке опрос останавливается: `refetchIntervalInBackground: false`.
- Окно подтверждения после Apply (60 секунд по NFR-5) отсчитывает UI, но решение об откате принимает демон — таймер в браузере не источник истины.

## Ретраи и префетч

- Мутации не повторяются автоматически. Для Apply это обязательно: повтор запустит второй цикл на устройстве.
- GET повторяется дважды, кроме ответов 4xx.
- Данные экрана, известные до перехода, тянутся `queryClient.prefetchQuery` в загрузчике роута, а не эффектом после монтирования.

## Правила

- GET — `useQuery`, всё остальное — `useMutation`.
- Возврат `useQuery` не деструктурируем — это ограничивает использование объекта query дальше по коду.
- Адрес endpoint вынесен в константу и участвует в `queryKey`.
- Ручной запрос вне монтирования — `queryClient.fetchQuery(options)`, а не `enabled` плюс костыль.
- `enabled: false` и инвалидация несовместимы: выключенные запросы не инвалидируются, это надо помнить при построении цепочек.

## Что идёт мимо Query

WebSocket-потоки дашборда (трафик, список соединений) в Query **не заворачиваются** — они пишут напрямую в стор потока. Причина в PRD, A.10: кэш поверх высокочастотного потока даёт устаревшие данные и лишние рендеры на 5000 соединений.

Подписка инициализируется в `app/`, обработчики живут в сегменте `api` соответствующего слайса и **обязаны возвращать функцию отписки**:

```ts
export function listenConnections(socket: WebSocket) {
  const handler = (event: MessageEvent) => {
    StreamStateProto.getState().pushSnapshot(parseSnapshot(event.data));
  };

  socket.addEventListener('message', handler);

  return () => socket.removeEventListener('message', handler);
}
```
