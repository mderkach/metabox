# Работа с запросами

TanStack Query v5 поверх axios. Транспорт закрыт врапперем `ApiClient` в `shared/api`: он держит таймаут, приводит отказ транспорта к доменному `ApiError` и отдаёт наружу тело ответа, а не конверт.

Ретраев в клиенте нет: ими заведует Query, и второй слой повторов запустил бы на устройстве второй цикл применения. Таймаут, наоборот, живёт только в клиенте — у `fetch` его нет вовсе, и зависший демон держал бы запрос до закрытия вкладки.

## Из чего состоит запрос

1. **fetch-функция** — знает про endpoint и DTO, ничего не знает про React;
2. **фабрика query-опций** — знает про ключ, кэш и meta;
3. **хук** — тонкая обёртка `useQuery` / `useMutation`.

Разделение нужно, чтобы те же опции уходили в `queryClient.query` и в тесты без React.

## fetch-функция

Обязательно принимает опциональный `AxiosRequestConfig` — через него Query передаёт `signal` и отменяет запрос при размонтировании.

```ts
export const CONFIG_ENDPOINT = {
  config: () => '/api/config',
  versions: () => '/api/config/versions',
  version: (id: number) => `/api/config/versions/${id}`,
} as const;

export async function getConfigVersions(config?: AxiosRequestConfig): Promise<ConfigVersionsWire> {
  return ApiClientInstance.get<ConfigVersionsWire>(CONFIG_ENDPOINT.versions(), config);
}
```

Ручки записи конфига нет: черновик живёт в сторе документа, а файл пишет только протокол Apply. Заводить `PUT /api/config` нельзя.

Требования:

- тип ответа задаётся дженериком, а не выводится из `any`;
- обработка ошибок — в `ApiClient`, он бросает типизированный `ApiError`; локальный `try/catch` в fetch-функции не нужен, тосты показывает глобальный обработчик (см. ниже);
- никаких преобразований данных: функция возвращает то, что прислал сервер. Разбирает ответ схемой фабрика опций — до того, как он ляжет в кэш.

## Разбор ответа

Ответ проверяется схемой слайса в `queryFn` фабрики опций, и в кэш ложится проверенная форма источника:

```ts
queryFn: async (context) => decodeResponse(ClashProxiesSchema, await getProxies(context), 'proxies'),
```

Перевод в модель экрана делает `select` — он берёт уже проверенные данные и в кэш не пишет:

```ts
return useQuery({ ...getProxiesOptions(), select: toProxyRuntime });
```

Разделение обязательное, и обе половины держатся на своих причинах.

**Проверка — только в `queryFn`.** Исключение, брошенное из `select`, query-core держит у наблюдателя (`#selectError`) и в `QueryCache.onError` не проводит: глобального тоста на непонятый ответ не будет, и до правила повтора отказ тоже не дойдёт. Отказ, брошенный из `queryFn`, проходит обычным путём. Закреплено тестом `shared/api/__tests__/schemaFailure.test.ts`.

**В кэше — форма источника, а не модель.** По ключу запроса ходят оптимистичные обновления: `ProxySelect` правит выбранный узел прямо в кэше (`withSelectedNode`), а `useSaveApplyTransaction` кладёт туда ответ на запуск применения. Обе операции написаны на форме источника, и модель на её месте их сломает.

Непонятый ответ становится `ApiError` вида `Schema` (`decodeResponse` в `shared/api`). Повторов у него нет: форма ответа от второго запроса не меняется. Транспорт такую ошибку не рождает — она приходит с границы слайса, поэтому `status` и `code` у неё пусты, а разбор ошибки лежит в `details`.

## queryKey factory

Ключи строятся от общего к частному. Общий префикс нужен для массовой инвалидации, частный — для точечной.

```ts
export const CONFIG_QUERY = {
  all: ['config'] as const,
  current: () => [...CONFIG_QUERY.all, 'current'] as const,
  history: () => [...CONFIG_QUERY.all, 'history'] as const,
  apply: (id: string) => [...CONFIG_QUERY.all, 'apply', id] as const,
} as const;
```

Ключ строится **только** фабрикой: литеральный массив в `useQuery` не найти при инвалидации.

Для записи в кэш ключ берётся у фабрики опций — `getServiceStateOptions().queryKey`, — а не у фабрики ключей. Тогда `setQueryData` и `getQueryData` типизируются данными этого запроса, и запись чужой формы перестаёт компилироваться; с ключом из отдельной фабрики тип пришлось бы ставить руками дженериком, а его никто не проверит.

## Фабрика опций и хук

```ts
export function getConfigOptions() {
  return queryOptions({
    queryKey: CONFIG_QUERY.current(),
    queryFn: getConfig,
    gcTime: CACHE_TIME.Hour,
    staleTime: CACHE_TIME.Minute,
    meta: { showError: true, errorMessageKey: 'toast.config.draft.fetchFailed' },
  });
}

export function useConfig() {
  return useQuery(getConfigOptions());
}
```

`gcTime` ниже `staleTime` бессмысленен.

Константы времени живут в `shared/api`:

```ts
const SECOND = MS_IN_SECOND;
const MINUTE = SECONDS_IN_MINUTE * SECOND;
const HOUR = MINUTES_IN_HOUR * MINUTE;

export const CACHE_TIME = {
  Second: SECOND,
  Minute: MINUTE,
  Hour: HOUR,
  Day: HOURS_IN_DAY * HOUR,
} as const;
```

Дефолты клиента — без кэша (`staleTime: 0`, `gcTime: 0`): кэширование включается осознанно, по запросу.

## meta и глобальная обработка ошибок

Тосты не разбросаны по хукам — они выводятся в `QueryCache` / `MutationCache` на основании `meta`. Поля `meta` readonly, сообщения задаются **ключами локализации**, а не готовыми строками.

Ключ берётся из неймспейса `shared` (`MessageKey` = `ParseKeys<'shared'>`), а не из словаря своего слайса: тост показывает одно место на всё приложение, и к этому моменту словарь слайса может быть ещё не загружен.

Ключ в `meta` говорит, **что** не вышло, а **почему** — код отказа демона: `failureText` переводит его по своей таблице кодов (`FAILURE_KEY` в `shared/api/failureText.ts`, наружу она не уходит), и тост собирается из двух половин — «Проверить задержку не удалось: рантайм sing-box не отвечает». Незнакомый код перевода не получает, и тогда в ход идёт `message` из ответа — он на языке демона, но это лучше, чем общая фраза вместо причины.

```ts
type ErrorMeta =
  | { readonly showError: true; readonly errorMessageKey?: MessageKey }
  | { readonly showError?: false; readonly errorMessageKey?: never };

type SuccessMeta =
  | { readonly showSuccess: true; readonly successMessageKey: MessageKey }
  | { readonly showSuccess?: false; readonly successMessageKey?: never };

export type QueryMeta = ErrorMeta & SuccessMeta;
```

Пересечение двух union-ов, а не набор необязательных полей: иначе
`showSuccess: true` без текста компилируется и запрос молча ничего не
показывает. При `showError` ключ необязателен — тогда берётся сообщение самой
ошибки, демон присылает его готовым к показу.

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

Данные в кэше — форма источника, проверенная схемой в `queryFn`. Перевод в модель экрана — через `select`, он кэш не трогает; адаптер получает уже проверенные данные и сам ничего не разбирает. Подробности и причины — в разделе «Разбор ответа».

Исключение одно: конфиг. `parseConfig` в `select` не бросает вовсе — узел, которого схема не знает, становится записью в `issues`, а не отказом, потому что такой конфиг обязан остаться правимым ([ADR-0018](../../../../docs/adr/ADR-0018-generate-strict-schemas-and-mark-what-the-panel-does-not-know.md)).

## Мутации и инвалидация

```ts
export function useApplyConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: applyConfig,
    meta: { showSuccess: true, successMessageKey: 'toast.apply.start.accepted' },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONFIG_QUERY.all });
    },
  });
}
```

- Инвалидируем максимально точным ключом, а не корнем, если знаем, что затронуто.
- Оптимистичное обновление — `onMutate` пишет в кэш и возвращает снапшот, `onError` откатывает, `onSettled` инвалидирует. Применяем там, где отклик важнее консистентности (переключение ноды на экране Proxies), но **не** в цикле Apply: там результат определяет `sing-box check` на устройстве, врать пользователю нельзя.

## Отказы и недоступность

Панель обязана работать при остановленном sing-box, поэтому ошибки разделены:

- `ApiError` различает «демон не ответил» и «демон ответил ошибкой». Первое — отказ панели, второе — данные экрана. К первому клиент относит и оборванный запрос, и истёкший таймаут, и шлюзовые статусы 502/503/504: их выставляет посредник между браузером и демоном, а не сам демон.
- Отмена запроса отказом не считается: её порождает сам Query при размонтировании, и клиент пропускает её как есть — иначе баннер недоступности мигал бы на каждом переходе между экранами.
- Состояние сервиса — обычный запрос, а не ошибка: экран рисует «сервис лежит» и оставляет доступным редактор.
- Баннер недоступности демона живёт в `app/`, экраны его не дублируют.

## Состояния блока

Состояние блока берётся у запроса, а не выводится по пустоте данных: пустой список после отказа читается как «данных нет», и пользователь уходит чинить конфиг, который цел. У блока три разных экрана:

- **Загрузка** — `isPending`: скелетон (`SkeletonRows` в `shared/ui`), а не строка «Загружаю». Проявляется он с задержкой (`PENDING_REVEAL`), поэтому быстрый ответ его так и не показывает. Экран целиком не блокируется.
- **Отказ** — `isLoadingError`: блок `QueryFailure` с причиной и повтором (`refetch`). Отказ поверх уже загруженных данных (`isRefetchError`) данных не прячет — о нём говорит тост из `meta`.
- **Пусто** — запрос успешен, данных нет: `Empty` из `shared/ui/shadcn` со словами, что это значит. «Пусто из-за отбора» — отдельный экран с кнопкой сброса ([Tables.md](./Tables.md)).

Заголовок блока отказа и тост одного запроса — один ключ: `QueryFailure` принимает тот же `MessageKey`, что стоит в `meta.errorMessageKey`. Ключи отказов чтения живут в `shared` под `source.*`, ключи отказов действий — под `toast.*`: у действия блока нет, только тост.

Переход между экранами не мигает скелетоном за счёт загрузчика маршрута: он ждёт данные экрана (см. «Ретраи и префетч»), и роутер показывает общий скелетон экрана (`defaultPendingComponent`) только после `defaultPendingMs`. Сбой, который экран не обработал сам, уходит в `defaultErrorComponent` роутера — он стоит внутри оболочки, и сайдбар остаётся.

## Опрос и таймеры

- Статус демона и ход цикла Apply опрашиваются `refetchInterval`; интервал — константа рядом с фабрикой ключа. Состояние службы своего опроса не имеет: оно приходит потоком рантайма ([ADR-0010](../../../../docs/adr/ADR-0010-stream-runtime-to-the-panel-over-sse.md)) и кладётся в кэш обработчиком топика.
- На скрытой вкладке опрос останавливается: `refetchIntervalInBackground: false`.
- Окно подтверждения после Apply (60 секунд) отсчитывает UI, но решение об откате принимает демон — таймер в браузере не источник истины.

## Ретраи и префетч

- Мутации не повторяются автоматически. Для Apply это обязательно: повтор запустит второй цикл на устройстве.
- GET повторяется дважды. Не повторяются ответы 4xx — это вердикт демона, недоступность демона — панель ждёт его с баннером, и непонятый схемой ответ — от второго запроса он не изменится.
- Данные экрана, известные до перехода, тянутся `queryClient.query(options)` в загрузчике маршрута, а не эффектом после монтирования. Отказ там гасится `.catch`: экран обязан открыться и при лежащем источнике, а отказ остаётся в кэше и показывается блоком экрана. `prefetchQuery`, `fetchQuery` и `ensureQueryData` в Query 5.103 объявлены устаревшими и не используются.

## Правила

- GET — `useQuery`, всё остальное — `useMutation`.
- Возврат `useQuery` не деструктурируем — это ограничивает использование объекта query дальше по коду.
- Адрес endpoint вынесен в константу. В `queryKey` он не участвует: ключ собирается фабрикой слайса из своих сегментов, и адрес в нём не повторяется.
- Ручной запрос вне монтирования — `queryClient.query(options)`, а не `enabled` плюс костыль.
- `enabled: false` и инвалидация несовместимы: выключенные запросы не инвалидируются, это надо помнить при построении цепочек.

## Что идёт мимо Query

Рантайм дашборда — трафик, память, показания платы, соединения и состояние службы — приходит одним SSE-потоком `GET /api/events`. В Query он **не заворачивается** — топики пишут напрямую в сторы своих слайсов. Причина: кэш поверх высокочастотного потока даёт устаревшие данные и лишние рендеры на 5000 соединений.

WebSocket в панели нет: демон отдаёт поток обычным HTTP-ответом и отклоняет апгрейд на ветке прокси `/api/clash/*`. Всё, что панель меняет, она меняет обычными запросами.

Одно соединение `EventSource` открывает `app/`, и оно же раздаётся слайсам. Обработчик живёт в сегменте `api` своего слайса, берёт данные из конверта через `listenTopic` и **обязан возвращать функцию отписки**:

```ts
export function listenTraffic(source: StreamSource): () => void {
  return listenTopic(source, RUNTIME_TOPIC.Traffic, (frame) => {
    const sample = toTrafficFrame(frame);

    if (sample !== null) {
      RuntimeStore.getState().pushTraffic(sample);
    }
  });
}
```

Обработчик принимает `StreamSource` — узкий интерфейс подписки, а не сам `EventSource`: так его можно проверить без транспорта.

Конверт несёт сквозной `seq`. Разрыв нумерации означает, что демон отбросил событие медленному читателю, — тогда состояние перезапрашивается запросом, а не достраивается по потоку. Следит за этим `watchSequence` в `shared/api`.
