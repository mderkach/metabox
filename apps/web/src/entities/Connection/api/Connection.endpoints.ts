/** Адреса соединений: демон проксирует их в Clash API дословно. */
export const CONNECTION_ENDPOINT = {
  connections: () => '/api/clash/connections',
  connection: (id: string) => `/api/clash/connections/${id}`,
} as const;
