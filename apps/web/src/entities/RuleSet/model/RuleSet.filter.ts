import { matchesWords, toQueryWords } from '@shared/lib/search';

import { findProvider } from './RuleSet.catalog';
import type { RuleSetRow } from './RuleSet.model';

function toSearchText(set: RuleSetRow): string {
  const provider = findProvider(set.source.providerId);

  return [set.tag, provider?.name ?? '', set.source.category ?? ''].join(' ').toLowerCase();
}

export function filterRuleSets(sets: RuleSetRow[], query: string): RuleSetRow[] {
  const words = toQueryWords(query);

  return sets.filter((set) => matchesWords(toSearchText(set), words));
}
