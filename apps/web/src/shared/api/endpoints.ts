/**
 * Адреса демона. Вынесены константами, потому что участвуют в `queryKey`:
 * литерал в двух местах разъезжается молча (Query.md).
 */
export const API_ENDPOINT = {
  health: () => '/healthz',
  status: () => '/api/status',
  config: () => '/api/config',
  apply: () => '/api/apply',
  applyState: (id: string) => `/api/apply/${id}`,
  applyConfirm: (id: string) => `/api/apply/${id}/confirm`,
} as const;
