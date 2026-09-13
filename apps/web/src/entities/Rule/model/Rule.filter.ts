import { countGroups } from '@shared/lib/group';
import { matchesWords, toQueryWords } from '@shared/lib/search';

import type { RuleRow } from './Rule.model';

/** Исход, по которому отбираются правила; `null` — все сразу. */
export type RuleTargetFilter = string | null;

export interface RuleTargetGroup {
  target: string;
  count: number;
}

/** Исходы в порядке убывания числа правил: по ним собираются фасеты экрана. */
export function toTargetGroups(rules: RuleRow[]): RuleTargetGroup[] {
  return countGroups(rules, (rule) => rule.target).map((group) => ({ target: group.value, count: group.count }));
}

export function filterRules(rules: RuleRow[], query: string, target: RuleTargetFilter): RuleRow[] {
  const words = toQueryWords(query);

  return rules.filter(
    (rule) => (target === null || rule.target === target) && matchesWords(rule.searchText.toLowerCase(), words)
  );
}
