import { z } from 'zod';

import { countGroups } from '@shared/lib/group';
import { matchesWords, toQueryWords } from '@shared/lib/search';

import { RULE_SET_MATCHER } from './Rule.constants';
import { RULE_TARGET, type RuleBranch, type RuleRow, type RuleTargetKind } from './Rule.model';

/** Outbounds and actions by which rules are selected; an empty list means all at once. */
export type RuleTargetFilter = readonly string[];

/** Set tag referenced by the selected rules; `null` means all at once. */
export type RuleSetFilter = string | null;

/**
 * Outbound facet in the URL: one value as a string, several as a list. The list
 * goes first: coercion would glue a list into one string. A tag of digits
 * arrives from the router as a number and stays a tag.
 */
const TargetParamSchema = z.union([z.array(z.coerce.string().min(1)).min(1), z.coerce.string().min(1)]);

/**
 * Rules screen state in the URL. The rule number is as in the UI, from one: the
 * connections screen leads to the matched node by it. The set is a selection
 * people arrive with from the set catalog: "who uses this set".
 */
export const RuleSearchSchema = z.object({
  rule: z.coerce.number().int().positive().optional(),
  rule_set: z.coerce.string().min(1).optional(),
  target: TargetParamSchema.optional(),
});

export type RuleSearch = z.infer<typeof RuleSearchSchema>;

/** A value that is not understood is dropped entirely: half a selection is worse than none. */
export function parseRuleSearch(search: Record<string, unknown>): RuleSearch {
  const parsed = RuleSearchSchema.safeParse(search);

  return parsed.success ? parsed.data : {};
}

/** Outbound facet selection from the URL. */
export function toTargetFilter(param: RuleSearch['target']): RuleTargetFilter {
  if (param === undefined) {
    return [];
  }

  return typeof param === 'string' ? [param] : param;
}

/** Outbound facet selection for the URL: one value is written as a string, so a link stays short. */
export function toTargetParam(targets: RuleTargetFilter): RuleSearch['target'] {
  if (targets.length === 0) {
    return undefined;
  }

  return targets.length === 1 ? targets[0] : [...targets];
}

export interface RuleTargetGroup {
  target: string;
  /** An action is named in words on screen, an outbound by its tag. */
  kind: RuleTargetKind;
  count: number;
}

/**
 * Outbounds of the whole list in descending order of rule count: the screen facet is built from them.
 * The counter is taken over `counted`, the rows the other filters leave: it says how many rows the
 * selection adds, while a value stays even when nothing is left under it.
 */
export function toTargetGroups(rules: RuleRow[], counted: RuleRow[] = rules): RuleTargetGroup[] {
  const actions = new Set(rules.filter((rule) => rule.targetKind === RULE_TARGET.Action).map((rule) => rule.target));
  const counts = new Map(countGroups(counted, (rule) => rule.target).map((group) => [group.value, group.count]));

  return countGroups(rules, (rule) => rule.target).map((group) => ({
    target: group.value,
    kind: actions.has(group.value) ? RULE_TARGET.Action : RULE_TARGET.Outbound,
    count: counts.get(group.value) ?? 0,
  }));
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
  targets: RuleTargetFilter,
  ruleSet: RuleSetFilter = null
): RuleRow[] {
  const words = toQueryWords(query);

  return rules.filter(
    (rule) =>
      (targets.length === 0 || targets.includes(rule.target)) &&
      (ruleSet === null || usesRuleSet(rule, ruleSet)) &&
      matchesWords(rule.searchText.toLowerCase(), words)
  );
}
