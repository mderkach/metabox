import { matchesWords, toQueryWords } from '@shared/lib/search';

import type { RuleSetRow } from './RuleSet.model';

function toSearchText(set: RuleSetRow): string {
  return [set.tag, set.source.providerName ?? '', set.source.kind ?? '', set.source.category ?? '']
    .join(' ')
    .toLowerCase();
}

export function filterRuleSets(sets: RuleSetRow[], query: string): RuleSetRow[] {
  const words = toQueryWords(query);

  return sets.filter((set) => matchesWords(toSearchText(set), words));
}
