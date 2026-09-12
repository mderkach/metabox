/** Адреса соединений: демон проксирует их в Clash API дословно (ADR-0006). */
export const CONNECTION_ENDPOINT = {
  connections: () => '/api/clash/connections',
  connection: (id: string) => `/api/clash/connections/${id}`,
} as const;
