/**
 * Адреса конфига. Константами, потому что участвуют в `queryKey`: литерал в
 * двух местах разъезжается молча (Query.md).
 */
export const CONFIG_ENDPOINT = {
  config: () => '/api/config',
  ruleSetFiles: () => '/api/config/rule-sets',
  versions: () => '/api/config/versions',
  version: (id: number) => `/api/config/versions/${id}`,
  versionRestore: (id: number) => `/api/config/versions/${id}/restore`,
} as const;
