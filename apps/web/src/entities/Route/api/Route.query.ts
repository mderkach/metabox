import { queryOptions, useQuery } from '@tanstack/react-query';

import { CACHE_TIME, decodeResponse } from '@shared/api';

import { toRouteExplanation } from '../model/Route.adapter';
import { getRouteExplanation } from './Route.api';
import { RouteExplanationSchema } from './Route.schema';

export const ROUTE_QUERY = {
  all: ['route'] as const,
  explanation: (id: string) => [...ROUTE_QUERY.all, 'explanation', id] as const,
} as const;

export function getRouteExplanationOptions(id: string) {
  return queryOptions({
    queryKey: ROUTE_QUERY.explanation(id),
    queryFn: async function fetchRouteExplanation({ signal }) {
      return decodeResponse(RouteExplanationSchema, await getRouteExplanation(id, { signal }), 'route');
    },
    staleTime: CACHE_TIME.Second,
    gcTime: CACHE_TIME.Minute,
    meta: { showError: true, errorMessageKey: 'source.route' },
  });
}

/**
 * Объяснение маршрута выбранного соединения. `null` — не выбрано ничего, и
 * запрос не заводится: ручка ходит к рантайму за списком правил.
 */
export function useRouteExplanation(id: string | null) {
  return useQuery({
    ...getRouteExplanationOptions(id ?? ''),
    enabled: id !== null,
    select: toRouteExplanation,
  });
}
