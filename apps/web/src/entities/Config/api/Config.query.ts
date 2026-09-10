import { queryOptions, useQuery } from '@tanstack/react-query';

import { CACHE_TIME } from '@shared/api';
import { ConfigSchema, type Config } from '@shared/api/generated';

import { getConfig } from './Config.api';

export const CONFIG_QUERY = {
  all: ['config'] as const,
  current: () => [...CONFIG_QUERY.all, 'current'] as const,
} as const;

export function getConfigOptions() {
  return queryOptions({
    queryKey: CONFIG_QUERY.current(),
    queryFn: async ({ signal }) => getConfig({ signal }),
    staleTime: CACHE_TIME.Minute,
    gcTime: CACHE_TIME.Hour,
    meta: { showError: true, errorMessageKey: 'config.draft.fetchFailed' },
  });
}

export interface ParsedConfig {
  /** `null` — схема конфиг не приняла; что именно, сказано в `issues`. */
  config: Config | null;
  issues: string[];
}

/**
 * Схема `looseObject`, поэтому незнакомые узлы разбор переживают (AC-3). Провал
 * не бросает: панель обязана открываться и на непонятом конфиге (NFR-1).
 */
export function parseConfig(data: unknown): ParsedConfig {
  const parsed = ConfigSchema.safeParse(data);

  if (parsed.success) {
    return { config: parsed.data, issues: [] };
  }

  return {
    config: null,
    issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
  };
}

export function useConfig() {
  return useQuery({ ...getConfigOptions(), select: parseConfig });
}
