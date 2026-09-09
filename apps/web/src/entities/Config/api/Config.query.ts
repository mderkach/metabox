import { queryOptions, useQuery } from "@tanstack/react-query"

import { CACHE_TIME } from "@shared/api"
import { ConfigSchema, type Config } from "@shared/api/generated"

import { getConfig } from "./Config.api"

/** Ключи от общего к частному: общий префикс нужен для массовой инвалидации. */
export const CONFIG_QUERY = {
  all: ["config"] as const,
  current: () => [...CONFIG_QUERY.all, "current"] as const,
} as const

export function getConfigOptions() {
  return queryOptions({
    queryKey: CONFIG_QUERY.current(),
    queryFn: async ({ signal }) => getConfig({ signal }),
    staleTime: CACHE_TIME.Minute,
    gcTime: CACHE_TIME.Hour,
    meta: { showError: true, errorMessageKey: "config.draft.fetchFailed" },
  })
}

/**
 * Итог разбора. Провал — не отсутствие данных: пустой конфиг и конфиг, который
 * схема не поняла, выглядят на экране одинаково, а означают разное, и молчать
 * о втором нельзя.
 */
export interface ParsedConfig {
  config: Config | null
  /** Сообщения схемы: по ним видно, какой узел она не приняла. */
  issues: string[]
}

/**
 * Разбирает ответ демона схемой.
 *
 * Схема `looseObject`, поэтому незнакомые узлы разбор переживают — это
 * требование AC-3, а не побочный эффект. Провал не бросает исключение: панель
 * обязана открываться и на конфиге, который она не понимает целиком (NFR-1).
 */
export function parseConfig(data: unknown): ParsedConfig {
  const parsed = ConfigSchema.safeParse(data)

  if (parsed.success) {
    return { config: parsed.data, issues: [] }
  }

  return {
    config: null,
    issues: parsed.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`
    ),
  }
}

export function useConfig() {
  return useQuery({ ...getConfigOptions(), select: parseConfig })
}
