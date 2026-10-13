/**
 * Config addresses. They are constants because they take part in `queryKey`: a
 * literal in two places drifts apart silently (Query.md).
 */
export const CONFIG_ENDPOINT = {
  config: () => '/api/config',
  ruleSetFiles: () => '/api/config/rule-sets',
  versions: () => '/api/config/versions',
  version: (id: number) => `/api/config/versions/${id}`,
  versionRestore: (id: number) => `/api/config/versions/${id}/restore`,
} as const;
