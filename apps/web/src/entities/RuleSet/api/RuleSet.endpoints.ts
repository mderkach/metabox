/** Daemon endpoint with the catalog of ready-made sets: providers and their categories. */
export const RULE_SET_ENDPOINT = {
  cached: () => '/api/rule-sets/cached',
  catalog: () => '/api/rule-sets/catalog',
} as const;
