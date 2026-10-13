/** Proxy addresses: the daemon proxies them to the Clash API verbatim. */
export const PROXY_ENDPOINT = {
  proxies: () => '/api/clash/proxies',
  proxy: (name: string) => `/api/clash/proxies/${encodeURIComponent(name)}`,
  proxyDelay: (name: string) => `/api/clash/proxies/${encodeURIComponent(name)}/delay`,
  providers: () => '/api/clash/providers/proxies',
  provider: (name: string) => `/api/clash/providers/proxies/${encodeURIComponent(name)}`,
} as const;
