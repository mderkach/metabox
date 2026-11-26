import { queryOptions, useQuery } from '@tanstack/react-query';

import { CACHE_TIME, decodeResponse } from '@shared/api';
import { CachedRuleSetSchema } from '@shared/api/daemon.generated';

import { toRuleSetCatalog } from '../model/RuleSet.adapter';
import type { CachedRuleSet } from '../model/RuleSet.model';
import { getCachedRuleSets, getRuleSetCatalog } from './RuleSet.api';
import { RuleSetCatalogSchema } from './RuleSet.schema';

export const RULE_SET_QUERY = {
  all: ['ruleSet'] as const,
  cached: () => [...RULE_SET_QUERY.all, 'cached'] as const,
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

export function useRuleSetCatalog() {
  return useQuery({ ...getRuleSetCatalogOptions(), select: toRuleSetCatalog });
}

function getCachedRuleSetOptions() {
  return queryOptions({
    queryKey: RULE_SET_QUERY.cached(),
    queryFn: async (context): Promise<CachedRuleSet[]> => {
      const entries = decodeResponse(CachedRuleSetSchema.array(), await getCachedRuleSets(context), 'cached rule sets');

      return entries.map((entry) => ({
        tag: entry.tag,
        state: entry.state,
        checkedAt: entry.checked_at,
        size: entry.size,
        otherAddress: entry.other_address,
      }));
    },
    staleTime: 0,
    gcTime: CACHE_TIME.Minute,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function useCachedRuleSets(enabled: boolean) {
  return useQuery({ ...getCachedRuleSetOptions(), enabled });
}
