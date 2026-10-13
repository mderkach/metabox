/**
 * Daemon addresses: its own endpoints, the apply cycle and the proxied Clash
 * API endpoints. The cycle belongs to the daemon, not to the config: the config
 * is the subject of apply, while the transaction state lives here.
 *
 * The `/api/clash/*` branch is request-response runtime: the daemon proxies the
 * Clash API keeping response shapes verbatim, and owns its address and secret.
 * Streams do not go there, everything arrives in one `GET /api/events`.
 */
export const DAEMON_ENDPOINT = {
  status: () => '/api/status',
  events: () => '/api/events',
  history: () => '/api/history',
  service: () => '/api/service',
  serviceAction: (action: string) => `/api/service/${action}`,
  apply: () => '/api/apply',
  applyState: (id: string) => `/api/apply/${id}`,
  applyConfirm: (id: string) => `/api/apply/${id}/confirm`,
  clashConfigs: () => '/api/clash/configs',
} as const;
