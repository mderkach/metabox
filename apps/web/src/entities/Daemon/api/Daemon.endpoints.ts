/**
 * Адреса демона: собственные ручки, цикл применения и проксированные ручки
 * Clash API. Цикл принадлежит демону, а не конфигу: конфиг —
 * предмет применения, а состояние транзакции живёт здесь.
 *
 * Ветка `/api/clash/*` — рантайм запрос-ответ: демон проксирует Clash API,
 * сохраняя формы ответов дословно, и владеет его адресом и секретом. Потоки
 * туда не ходят, всё приходит одним `GET /api/events`.
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
