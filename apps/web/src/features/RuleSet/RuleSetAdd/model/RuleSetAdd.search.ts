import { matchesWords, toQueryWords } from '@shared/lib/search';

import { SUGGESTION_LIMIT } from './RuleSetAdd.constants';

/** Nodes matching what was typed: the hint narrows the same way as search over the panel lists. */
export function matchOutbounds(outbounds: readonly string[], query: string): string[] {
  const words = toQueryWords(query);

  return outbounds.filter((tag) => matchesWords(tag.toLowerCase(), words)).slice(0, SUGGESTION_LIMIT);
}
