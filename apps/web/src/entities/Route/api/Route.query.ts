import { queryOptions, useQuery } from '@tanstack/react-query';

import { CACHE_TIME } from '@shared/api';

import { toRouteExplanation } from '../model/Route.adapter';
import { getRouteExplanation } from './Route.api';

export const ROUTE_QUERY = {
  all: ['route'] as const,
  explanation: (id: string) => [...ROUTE_QUERY.all, 'explanation', id] as const,
} as const;

export function getRouteExplanationOptions(id: string) {
  return queryOptions({
    queryKey: ROUTE_QUERY.explanation(id),
    // Разбор до кэша, а не в `select`: `select` меняет то, что видит хук, но
    // не то, что лежит в кэше, и чужая форма осталась бы доступна всякому,
    // кто возьмёт эти данные по ключу.
    queryFn: async ({ signal }) => toRouteExplanation(await getRouteExplanation(id, { signal })),
    staleTime: CACHE_TIME.Second,
    gcTime: CACHE_TIME.Minute,
    meta: { showError: true, errorMessageKey: 'route.explain.failed' },
  });
}

/**
 * Объяснение маршрута выбранного соединения. `null` — не выбрано ничего, и
 * запрос не заводится: ручка ходит к рантайму за списком правил.
 */
export function useRouteExplanation(id: string | null) {
  return useQuery({ ...getRouteExplanationOptions(id ?? ''), enabled: id !== null });
}
