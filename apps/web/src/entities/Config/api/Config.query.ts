import { queryOptions, useQuery } from "@tanstack/react-query"

import { CACHE_TIME } from "@shared/api"
import { ConfigSchema } from "@shared/api/generated"

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
 * Конфиг, разобранный схемой. Схема `looseObject`, поэтому незнакомые узлы
 * переживают разбор — это требование AC-3, а не побочный эффект.
 *
 * Провал разбора не гасит экран: панель обязана открываться и на конфиге,
 * который она не понимает целиком (NFR-1).
 */
export function useConfig() {
  return useQuery({
    ...getConfigOptions(),
    select: (data) => {
      const parsed = ConfigSchema.safeParse(data)

      return parsed.success ? parsed.data : null
    },
  })
}
