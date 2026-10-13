import { z } from 'zod';

import { countGroups } from '@shared/lib/group';
import { matchesWords, toQueryWords } from '@shared/lib/search';

import { RULE_SET_MATCHER } from './Rule.constants';
import type { RuleBranch, RuleRow } from './Rule.model';

/** Outbound by which rules are selected; `null` means all at once. */
export type RuleTargetFilter = string | null;

/** Set tag referenced by the selected rules; `null` means all at once. */
export type RuleSetFilter = string | null;

/**
 * Rules screen state in the URL. The rule number is as in the UI, from one: the
 * connections screen leads to the matched node by it. The set is a selection
 * people arrive with from the set catalog: "who uses this set".
 */
export const RuleSearchSchema = z.object({
  rule: z.coerce.number().int().positive().optional(),
  rule_set: z.coerce.string().min(1).optional(),
});

export type RuleSearch = z.infer<typeof RuleSearchSchema>;

/** A value that is not understood is dropped entirely: half a selection is worse than none. */
export function parseRuleSearch(search: Record<string, unknown>): RuleSearch {
  const parsed = RuleSearchSchema.safeParse(search);

  return parsed.success ? parsed.data : {};
}

export interface RuleTargetGroup {
  target: string;
  count: number;
}

/** Outbounds in descending order of rule count: the screen facets are built from them. */
export function toTargetGroups(rules: RuleRow[]): RuleTargetGroup[] {
  return countGroups(rules, (rule) => rule.target).map((group) => ({ target: group.value, count: group.count }));
}

/**
 * Whether a branch refers to a set. A logical rule refers to it from nested
 * branches, and this is counted the same way as a direct reference, otherwise
 * the selection would diverge from the usage mark in the set catalog.
 */
function usesRuleSet(branch: RuleBranch, tag: string): boolean {
  return (
    branch.matchers.some((matcher) => matcher.key === RULE_SET_MATCHER && matcher.values.includes(tag)) ||
    (branch.group?.children.some((child) => usesRuleSet(child, tag)) ?? false)
  );
}

export function filterRules(
  rules: RuleRow[],
  query: string,
  target: RuleTargetFilter,
  ruleSet: RuleSetFilter = null
): RuleRow[] {
  const words = toQueryWords(query);

  return rules.filter(
    (rule) =>
      (target === null || rule.target === target) &&
      (ruleSet === null || usesRuleSet(rule, ruleSet)) &&
      matchesWords(rule.searchText.toLowerCase(), words)
  );
}
