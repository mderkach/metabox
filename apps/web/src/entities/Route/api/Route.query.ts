import { queryOptions, useQuery } from '@tanstack/react-query';

import { CACHE_TIME, decodeResponse } from '@shared/api';

import { toRouteExplanation, toRuleHits } from '../model/Route.adapter';
import { getRouteExplanation, getRuleHits } from './Route.api';
import { RouteExplanationSchema, RuleHitsSchema } from './Route.schema';

export const ROUTE_QUERY = {
  all: ['route'] as const,
  explanation: (id: string) => [...ROUTE_QUERY.all, 'explanation', id] as const,
  hits: () => [...ROUTE_QUERY.all, 'hits'] as const,
} as const;

/** Счёт растёт на глазах, но не посекундно: правило срабатывает на новое соединение. */
const HITS_REFETCH_SECONDS = 5;
const HITS_REFETCH = HITS_REFETCH_SECONDS * CACHE_TIME.Second;

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

export function getRuleHitsOptions() {
  return queryOptions({
    queryKey: ROUTE_QUERY.hits(),
    queryFn: async (context) => decodeResponse(RuleHitsSchema, await getRuleHits(context), 'rule hits'),
    staleTime: CACHE_TIME.Second,
    gcTime: CACHE_TIME.Minute,
    refetchInterval: HITS_REFETCH,
    refetchIntervalInBackground: false,
    // Счёт — дополнение к списку правил: его отказ объясняет подвал списка, а
    // тост на каждый опрос при лежащем sing-box был бы шумом.
    meta: { showError: false },
  });
}

/** Счёт срабатываний правил работающего процесса, который ведёт демон. */
export function useRuleHits() {
  return useQuery({ ...getRuleHitsOptions(), select: toRuleHits });
}
