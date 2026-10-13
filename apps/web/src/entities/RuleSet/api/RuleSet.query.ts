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
 * The daemon checks the catalog against providers once a day, so the panel
 * holds it for a day too: there is nothing to ask for more often.
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

/** Catalog of ready-made sets: providers, their lists and categories. */
export function useRuleSetCatalog() {
  return useQuery({ ...getRuleSetCatalogOptions(), select: toRuleSetCatalog });
}
