/** Адреса прокси: демон проксирует их в Clash API дословно (ADR-0006). */
export const PROXY_ENDPOINT = {
  proxies: () => '/api/clash/proxies',
  proxy: (name: string) => `/api/clash/proxies/${encodeURIComponent(name)}`,
  proxyDelay: (name: string) => `/api/clash/proxies/${encodeURIComponent(name)}/delay`,
  providers: () => '/api/clash/providers/proxies',
} as const;
