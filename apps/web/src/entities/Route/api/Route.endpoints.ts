/**
 * Ручки демона про маршрут: объяснение соединения (ADR-0007) и счёт
 * срабатываний правил. Обе считает демон, а не Clash API.
 */
export const ROUTE_ENDPOINT = {
  explanation: (id: string) => `/api/connections/${encodeURIComponent(id)}/route`,
  hits: () => '/api/rules/hits',
} as const;
