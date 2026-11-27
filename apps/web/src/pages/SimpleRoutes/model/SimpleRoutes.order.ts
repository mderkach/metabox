import { compareRouteConditions, readPlainRouteConditions, ruleSetReferencesOf, type RuleRow } from '@entities/Rule';

export const SIMPLE_RULE_GROUPS = ['services', 'sites', 'devices', 'default', 'advanced'] as const;
export type SimpleRuleGroup = (typeof SIMPLE_RULE_GROUPS)[number];

export function simpleRuleGroup(rule: RuleRow, node: unknown): SimpleRuleGroup {
  if (readPlainRouteConditions(node) === null) return 'advanced';
  if (rule.matchers.some(({ key }) => key === 'source_ip_cidr')) return 'devices';
  if (ruleSetReferencesOf(rule).length > 0) return 'services';
  return rule.isCatchAll ? 'default' : 'sites';
}

export type SimpleMoveLimit = { reason: 'advancedMove' | 'covers' | 'unknown'; index: number };

/** Positions are one-based. Compare every pair whose relative order the move reverses. */
export function simpleMoveLimit(nodes: readonly unknown[], from: number, to: number): SimpleMoveLimit | null {
  const source = nodes[from - 1];
  if (readPlainRouteConditions(source) === null) return { reason: 'advancedMove', index: from };

  const step = to > from ? 1 : -1;
  for (let index = from; index !== to;) {
    index += step;
    const other = nodes[index - 1];
    if (readPlainRouteConditions(other) === null) return { reason: 'advancedMove', index };
    const earlier = step > 0 ? other : source;
    const later = step > 0 ? source : other;
    const relation = compareRouteConditions(earlier, later);
    if (relation === 'covers') return { reason: 'covers', index };
    if (relation !== 'disjoint' && compareRouteConditions(later, earlier) !== 'covers') {
      return { reason: 'unknown', index };
    }
  }
  return null;
}
