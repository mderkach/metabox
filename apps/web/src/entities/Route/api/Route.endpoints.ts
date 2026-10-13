/**
 * Daemon endpoints about the route: connection explanation and the rule hit
 * count. Both are computed by the daemon, not the Clash API.
 */
export const ROUTE_ENDPOINT = {
  explanation: (id: string) => `/api/connections/${encodeURIComponent(id)}/route`,
  hits: () => '/api/rules/hits',
} as const;
