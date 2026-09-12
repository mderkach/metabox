/** Адрес объяснения маршрута: ручка демона, а не Clash API (ADR-0007). */
export const ROUTE_ENDPOINT = {
  explanation: (id: string) => `/api/connections/${encodeURIComponent(id)}/route`,
} as const;
