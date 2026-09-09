/**
 * Адреса демона. Вынесены константами, потому что участвуют в `queryKey`:
 * литерал в двух местах разъезжается молча (Query.md).
 *
 * `config` демон пока не обслуживает: у него есть только состояние и цикл
 * применения. Адрес объявлен заранее, потому что от него строится ключ запроса,
 * а подмену снимает флаг `VITE_METABOX_MOCK_CONFIG`.
 */
export const API_ENDPOINT = {
  health: () => "/healthz",
  status: () => "/api/status",
  config: () => "/api/config",
  apply: () => "/api/apply",
  applyState: (id: string) => `/api/apply/${id}`,
  applyConfirm: (id: string) => `/api/apply/${id}/confirm`,
} as const
