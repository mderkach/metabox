# Working with requests

TanStack Query v5 on top of axios. The transport is closed behind the `ApiClient` wrapper in `shared/api`: it holds the timeout, maps a transport failure to the domain `ApiError` and returns the response body, not the envelope. The only thing it takes from the envelope is the `ETag` in `getTagged`: optimistic locking of apply relies on it (`GET /api/config` → `If-Match`).

There are no retries in the client: Query handles them, and a second retry layer would start a second apply cycle on the device. The timeout, on the contrary, lives only in the client: `fetch` has none at all, and a hung daemon would hold the request until the tab is closed.

## What a request consists of

1. **fetch function**: knows about the endpoint and the DTO, knows nothing about React;
2. **query options factory**: knows about the key, the cache and meta;
3. **hook**: a thin wrapper over `useQuery` / `useMutation`.

The split is needed so that the same options go into `queryClient.query` and into tests without React.

## fetch function

It must take an optional `AxiosRequestConfig`: through it Query passes `signal` and cancels the request on unmount.

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

There is no endpoint for writing the config: the draft lives in the document store, and only the Apply protocol writes the file. Adding `PUT /api/config` is forbidden.

Requirements:

- the response type is set by a generic, not inferred from `any`;
- error handling is in `ApiClient`, which throws a typed `ApiError`; a local `try/catch` in the fetch function is not needed, toasts are shown by the global handler (see below);
- no data transformations: the function returns what the server sent. The options factory parses the response with a schema, before it goes into the cache.

## Parsing the response

The response is checked with the slice schema in the `queryFn` of the options factory, and the checked source shape goes into the cache:

```ts
queryFn: async (context) => decodeResponse(ClashProxiesSchema, await getProxies(context), 'proxies'),
```

Conversion into the screen model is done by `select`: it takes already checked data and does not write to the cache:

```ts
return useQuery({ ...getProxiesOptions(), select: toProxyRuntime });
```

The split is mandatory, and each half rests on its own reasons.

**Checking happens only in `queryFn`.** An exception thrown from `select` is held by query-core at the observer (`#selectError`) and not passed to `QueryCache.onError`: there will be no global toast for a misunderstood response, and the failure will not reach the retry rule either. A failure thrown from `queryFn` goes the normal way. The test `entities/Proxy/__tests__/Proxy.schemaFailure.test.ts` pins the second half: a schema failure from `queryFn` reaches the toast and is not retried. That an exception from `select` does not reach `onError` is not pinned by a separate test.

**The cache holds the source shape, not the model.** Optimistic updates go through the query key: `ProxySelect` edits the selected node directly in the cache (`withSelectedNode`), and `useSaveApplyTransaction` puts the response to the apply start there. Both operations are written against the source shape, and a model in its place would break them.

A misunderstood response becomes an `ApiError` of kind `Schema` (`decodeResponse` in `shared/api`). It has no retries: the response shape does not change on a second request. The transport does not produce such an error: it comes from the slice boundary, so its `status` and `code` are empty, and the parse error is in `details`.

## queryKey factory

Keys are built from general to specific. The general prefix is needed for bulk invalidation, the specific part for targeted invalidation.

```ts
export const CONFIG_QUERY = {
  all: ['config'] as const,
  current: () => [...CONFIG_QUERY.all, 'current'] as const,
  history: () => [...CONFIG_QUERY.all, 'history'] as const,
  apply: (id: string) => [...CONFIG_QUERY.all, 'apply', id] as const,
} as const;
```

A key is built **only** by the factory: a literal array in `useQuery` cannot be found during invalidation.

For writing to the cache the key is taken from the options factory, `getServiceStateOptions().queryKey`, not from the key factory. Then `setQueryData` and `getQueryData` are typed by this query's data, and writing a foreign shape stops compiling; with a key from a separate factory the type would have to be set by hand as a generic, and nobody would check it.

## Options factory and hook

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

`gcTime` lower than `staleTime` makes no sense.

Time constants live in `shared/api`:

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

The client defaults are no cache (`staleTime: 0`, `gcTime: 0`): caching is enabled deliberately, per query.

## meta and global error handling

Toasts are not scattered across hooks: they are shown in `QueryCache` / `MutationCache` based on `meta`. The `meta` fields are readonly, messages are set by **localization keys**, not by ready strings.

The key is taken from the `shared` namespace (`MessageKey` = `ParseKeys<'shared'>`), not from the slice's own dictionary: one place in the whole application shows the toast, and by that moment the slice dictionary may not be loaded yet.

The key in `meta` says **what** failed, and the daemon's failure code says **why**: `failureText` translates the code by its own code table (`FAILURE_KEY` in `shared/api/failureText.ts`, not exported), and the toast is assembled from two halves, for example «Проверить задержку не удалось: рантайм sing-box не отвечает» ("Could not check the delay: the sing-box runtime does not respond"; the panel UI text is Russian). An unknown code gets no translation, and then the `message` from the response is used: it is in the daemon's language, but that is better than a generic phrase instead of the reason.

```ts
type ErrorMeta =
  | { readonly showError: true; readonly errorMessageKey?: MessageKey }
  | { readonly showError?: false; readonly errorMessageKey?: never };

type SuccessMeta =
  | { readonly showSuccess: true; readonly successMessageKey: MessageKey }
  | { readonly showSuccess?: false; readonly successMessageKey?: never };

export type QueryMeta = ErrorMeta & SuccessMeta;
```

An intersection of two unions, not a set of optional fields: otherwise
`showSuccess: true` without text compiles and the query silently shows
nothing. With `showError` the key is optional: then the error's own message
is used, the daemon sends it ready for display.

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

`meta` typing is extended through augmentation, not with casts:

```ts
declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: QueryMeta;
    mutationMeta: QueryMeta;
  }
}
```

## Data transformation

Data in the cache is the source shape checked by the schema in `queryFn`. Conversion into the screen model goes through `select`, which does not touch the cache; the adapter gets already checked data and parses nothing itself. Details and reasons: the "Parsing the response" section.

There is one exception: the config. `parseConfig` in `select` never throws: a node unknown to the schema becomes an entry in `issues`, not a failure, because such a config must stay editable ([ADR-0018](../../../../docs/adr/ADR-0018-generate-strict-schemas-and-mark-what-the-panel-does-not-know.md)).

## Mutations and invalidation

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

- Invalidate with the most precise key, not the root, if you know what is affected.
- Optimistic update: `onMutate` writes to the cache and returns a snapshot, `onError` rolls back, `onSettled` invalidates. Use it where responsiveness matters more than consistency (switching a node on the Proxies screen), but **not** in the Apply cycle: there the result is decided by `sing-box check` on the device, and lying to the user is not allowed.

## Failures and unavailability

The panel must work while sing-box is stopped, so errors are separated:

- `ApiError` distinguishes "the daemon did not answer" from "the daemon answered with an error". The first is a panel failure, the second is screen data. The client counts as the first an aborted request, an expired timeout and the gateway statuses 502/503/504: they are set by an intermediary between the browser and the daemon, not by the daemon itself.
- Request cancellation is not a failure: Query itself produces it on unmount, and the client passes it through as is; otherwise the unavailability banner would blink on every transition between screens.
- Service state is a regular query, not an error: the screen draws "the service is down" and keeps the editor available.
- The daemon unavailability banner lives in `app/`, screens do not duplicate it.
- A 401 is a lost session, not a screen failure. It gets no toast (`isSessionLost` in `shared/api`); `useSessionWatch` in `app/` listens to both caches and puts the logged-out state into the `Auth` query, and `AuthGate` replaces the whole panel with the login screen. After login the route loaders run again.

## Block states

A block's state is taken from the query, not inferred from empty data: an empty list after a failure reads as "there is no data", and the user goes to fix a config that is intact. A block has three different screens:

- **Loading**: `isPending`: a skeleton (`SkeletonRows` in `shared/ui`), not a "Loading" line. It appears with a delay (`PENDING_REVEAL`), so a fast response never shows it. The whole screen is not blocked.
- **Failure**: `isLoadingError`: a `QueryFailure` block with the reason and a retry (`refetch`). A failure on top of already loaded data (`isRefetchError`) does not hide the data: a toast from `meta` reports it.
- **Empty**: the query succeeded, there is no data: `Empty` from `shared/ui/shadcn` with words that say what it means. "Empty because of a filter" is a separate screen with a reset button ([Tables.md](./Tables.md)).

The failure block title and the toast of one query are one key: `QueryFailure` takes the same `MessageKey` as `meta.errorMessageKey`. Keys of read failures live in `shared` under `source.*`, keys of action failures under `toast.*`: an action has no block, only a toast.

A transition between screens does not blink with a skeleton thanks to the route loader: it waits for the screen data (see "Retries and prefetch"), and the router shows the common screen skeleton (`defaultPendingComponent`) only after `defaultPendingMs`. A failure that the screen did not handle itself goes to the router's `defaultErrorComponent`: it sits inside the shell, and the sidebar stays.

## Polling and timers

- Daemon status and the progress of the Apply cycle are polled with `refetchInterval`; the interval is a constant next to the key factory. Service state has no polling of its own: it arrives through the runtime stream ([ADR-0010](../../../../docs/adr/ADR-0010-stream-runtime-to-the-panel-over-sse.md)) and is put into the cache by the topic handler.
- On a hidden tab polling stops: `refetchIntervalInBackground: false`.
- The confirmation window after Apply (60 seconds) is counted down by the UI, but the rollback decision is made by the daemon: the browser timer is not the source of truth.

## Retries and prefetch

- Mutations are not retried automatically. For Apply this is mandatory: a retry starts a second cycle on the device.
- GET is retried twice. Not retried: 4xx responses, which are the daemon's verdict; daemon unavailability, where the panel waits for it with a banner; and a response the schema did not understand, which will not change on a second request.
- Screen data known before the transition is fetched with `queryClient.query(options)` in the route loader, not by an effect after mounting. A failure there is swallowed with `.catch`: the screen must open even when the source is down, and the failure stays in the cache and is shown by the screen's block. `prefetchQuery`, `fetchQuery` and `ensureQueryData` are deprecated in Query 5.103 and are not used.

## Rules

- GET is `useQuery`, everything else is `useMutation`.
- The return of `useQuery` is not destructured: that limits the use of the query object further down the code.
- The endpoint address is moved into a constant. It does not take part in `queryKey`: the key is assembled by the slice factory from its own segments, and the address is not repeated in it.
- A manual request outside mounting is `queryClient.query(options)`, not `enabled` plus a workaround.
- `enabled: false` and invalidation are incompatible: disabled queries are not invalidated; keep this in mind when building chains.

## What bypasses Query

Dashboard runtime data (traffic, memory, board readings, connections and service state) arrives through one SSE stream, `GET /api/events`. It is **not wrapped** in Query: topics write directly into the stores of their slices. The reason: a cache on top of a high-frequency stream gives stale data and extra renders at 5000 connections.

The panel has no WebSocket: the daemon returns the stream as a regular HTTP response and rejects the upgrade on the `/api/clash/*` proxy branch. Everything the panel changes, it changes with regular requests.

`app/` opens one `EventSource` connection, and it is shared with the slices. A handler lives in the `api` segment of its slice, takes data from the envelope through `listenTopic` and **must return an unsubscribe function**:

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

The handler takes a `StreamSource`, a narrow subscription interface, not the `EventSource` itself: this way it can be checked without a transport.

The log stream `GET /api/logs/stream` is an exception to "one connection": the daemon runs a separate `logread -f` process per reader, there are at most four streams, and the log level is a URL parameter. So it is opened by `useLogStream` of the `Log` slice while the logs screen is mounted, not by the shell on all screens. Lines go into the slice store in a batch, and a `seq` gap is counted there as lost lines. The browser does not reconnect after a daemon refusal (429, 503): the hook reopens the stream by `LOG_RECONNECT`; on a hidden tab the stream is closed so that background tabs do not take slots at the daemon. The tail is reread on every stream opening, and `mergeLogEntries` joins the tail and the stream.

The envelope carries a shared `seq`. A gap in numbering means the daemon dropped an event for a slow reader; then the state is requested again with a query, not rebuilt from the stream. `watchSequence` in `shared/api` watches this.
