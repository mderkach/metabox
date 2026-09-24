import { queryOptions, useQuery } from '@tanstack/react-query';

import { CACHE_TIME, decodeResponse } from '@shared/api';

import { toRuleSetCatalog } from '../model/RuleSet.adapter';
import { getRuleSetCatalog } from './RuleSet.api';
import { RuleSetCatalogSchema } from './RuleSet.schema';

export const RULE_SET_QUERY = {
  all: ['ruleSet'] as const,
  catalog: () => [...RULE_SET_QUERY.all, 'catalog'] as const,
} as const;

/**
 * Каталог демон сверяет с поставщиками раз в сутки, поэтому и панель держит
 * его сутки: чаще спрашивать нечего.
 */
export function getRuleSetCatalogOptions() {
  return queryOptions({
    queryKey: RULE_SET_QUERY.catalog(),
    queryFn: async (context) =>
      decodeResponse(RuleSetCatalogSchema, await getRuleSetCatalog(context), 'rule-set catalog'),
    staleTime: CACHE_TIME.Day,
    gcTime: CACHE_TIME.Day,
    meta: { showError: true, errorMessageKey: 'source.ruleSetCatalog' },
  });
}

/** Каталог готовых наборов: поставщики, их списки и категории. */
export function useRuleSetCatalog() {
  return useQuery({ ...getRuleSetCatalogOptions(), select: toRuleSetCatalog });
}
