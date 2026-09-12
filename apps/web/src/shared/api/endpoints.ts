/**
 * Адреса демона. Вынесены константами, потому что участвуют в `queryKey`:
 * литерал в двух местах разъезжается молча (Query.md).
 *
 * Ветка `/api/clash/*` — ручки рантайма запрос-ответ: демон проксирует Clash
 * API, сохраняя формы ответов дословно, и владеет его адресом и секретом.
 * Потоки туда не ходят: трафик, память и соединения приходят одним
 * `GET /api/events` (ADR-0010).
 */
export const API_ENDPOINT = {
  health: () => '/healthz',
  status: () => '/api/status',
  config: () => '/api/config',
  configVersions: () => '/api/config/versions',
  configVersion: (id: number) => `/api/config/versions/${id}`,
  configVersionRestore: (id: number) => `/api/config/versions/${id}/restore`,
  apply: () => '/api/apply',
  applyState: (id: string) => `/api/apply/${id}`,
  applyConfirm: (id: string) => `/api/apply/${id}/confirm`,
  connectionRoute: (id: string) => `/api/connections/${encodeURIComponent(id)}/route`,
  events: () => '/api/events',
  service: () => '/api/service',
  serviceAction: (action: string) => `/api/service/${action}`,
  clashVersion: () => '/api/clash/version',
  clashConfigs: () => '/api/clash/configs',
  clashProxies: () => '/api/clash/proxies',
  clashProxy: (name: string) => `/api/clash/proxies/${encodeURIComponent(name)}`,
  clashProxyDelay: (name: string) => `/api/clash/proxies/${encodeURIComponent(name)}/delay`,
  clashProviders: () => '/api/clash/providers/proxies',
  clashProvider: (name: string) => `/api/clash/providers/proxies/${encodeURIComponent(name)}`,
  clashProviderHealthcheck: (name: string) => `/api/clash/providers/proxies/${encodeURIComponent(name)}/healthcheck`,
  clashRules: () => '/api/clash/rules',
  clashConnections: () => '/api/clash/connections',
  clashConnection: (id: string) => `/api/clash/connections/${id}`,
} as const;
