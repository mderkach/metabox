/** Connection addresses: the daemon proxies them to the Clash API verbatim. */
export const CONNECTION_ENDPOINT = {
  connections: () => '/api/clash/connections',
  connection: (id: string) => `/api/clash/connections/${id}`,
} as const;
