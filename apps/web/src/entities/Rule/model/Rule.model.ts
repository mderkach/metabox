import { RULE_SET_MATCHER } from './Rule.constants';

export interface RuleMatcher {
  key: string;
  values: string[];
}

/**
 * Logical rule branch: either its own conditions or a group again; nesting is
 * not limited in sing-box.
 */
export interface RuleBranch {
  matchers: RuleMatcher[];
  group: RuleGroup | null;
}

export interface RuleGroup {
  /** `and` means all branches must fire, `or` means one is enough. */
  mode: string;
  /** `invert` flips the result of the whole group, not of a single branch. */
  invert: boolean;
  children: RuleBranch[];
}

export const RULE_TARGET = {
  Outbound: 'outbound',
  Action: 'action',
} as const;

export type RuleTargetKind = (typeof RULE_TARGET)[keyof typeof RULE_TARGET];

/**
 * New rule node: without conditions, with one outbound. The fork rejects an
 * empty node (`missing conditions`), and `action: route` without an outbound
 * too (`missing outbound field`), while `sing-box check` accepts an
 * unconditional rule with an outbound. With an outbound that matches the
 * default route at the end of the list, such a rule does not change routing
 * until conditions are set for it.
 */
export function newRuleNode(outbound: string): { outbound: string } {
  return { outbound };
}

export interface RuleRow {
  /** Position in the list: sing-box rules have no identifier of their own. */
  id: string;
  /** Number in `route.rules`, counting from one. */
  index: number;
  matchers: RuleMatcher[];
  /** `null` means an ordinary rule; otherwise the conditions are joined by `and` or `or`. */
  group: RuleGroup | null;
  invert: boolean;
  target: string;
  targetKind: RuleTargetKind;
  /** Action parameters (`method`, `sniffer`, `server`) if they are set. */
  targetDetail: string | null;
  /**
   * A rule without conditions: matches everything and ends the list. A logical
   * rule is never like this: its conditions are in nested branches.
   */
  isCatchAll: boolean;
  /**
   * The node is accepted by the schema. False means it has a field the schema
   * does not know: the conditions of such a node are shown incompletely, and it
   * is edited as text.
   */
  recognized: boolean;
  /** Conditions and target in one string: the table search looks through it. */
  searchText: string;
}

/** Position of a new rule in `route.rules`, from one, and its outbound. */
export interface NewRulePlace {
  index: number;
  outbound: string;
}

/**
 * A new rule goes before the first rule without conditions that sends traffic
 * to an outbound: rules below it never fire, and a rule added at the end of
 * such a list would be dead. It takes that rule's outbound, so until its
 * conditions are set it routes the same traffic the same way. Without such a
 * rule the new one goes to the end with the default route outbound
 * (`fallback`); `null` means there is no outbound to give it.
 *
 * `total` is the number of nodes in `route.rules`, not of rows: a non-object
 * node gets no row but still takes a position.
 */
export function newRulePlace(rules: readonly RuleRow[], total: number, fallback: string | null): NewRulePlace | null {
  const catchAll = rules.find((rule) => rule.isCatchAll && rule.targetKind === RULE_TARGET.Outbound);

  if (catchAll !== undefined) {
    return { index: catchAll.index, outbound: catchAll.target };
  }

  return fallback === null ? null : { index: total + 1, outbound: fallback };
}

/**
 * Set tags the rule refers to itself, without nested branches. The string
 * `"rule_set": "x"` arrives as a list of one tag.
 */
export function ruleSetsOf(rule: RuleRow): string[] {
  return rule.matchers.find((matcher) => matcher.key === RULE_SET_MATCHER)?.values ?? [];
}
