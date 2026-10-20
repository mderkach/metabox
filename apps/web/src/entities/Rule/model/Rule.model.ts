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

const REJECT = 'reject';

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
 * Before the first unconditional rule that ends the list, to an outbound or
 * `reject`: rules below it never fire. The new rule takes that rule's outbound,
 * or `fallback` before a `reject`; otherwise it goes to the end with
 * `fallback`. `null` means no outbound to give it. `total` counts nodes, not
 * rows.
 */
export function newRulePlace(rules: readonly RuleRow[], total: number, fallback: string | null): NewRulePlace | null {
  const catchAll = rules.find(
    (rule) => rule.isCatchAll && (rule.targetKind === RULE_TARGET.Outbound || rule.target === REJECT)
  );
  const index = catchAll?.index ?? total + 1;
  const outbound = catchAll?.targetKind === RULE_TARGET.Outbound ? catchAll.target : fallback;

  return outbound === null ? null : { index, outbound };
}

/** The row of a rule that is not in the document yet: what the panel shows while it is being filled in. */
export function toNewRuleRow(place: NewRulePlace): RuleRow {
  return {
    id: `new:${String(place.index)}`,
    index: place.index,
    matchers: [],
    group: null,
    invert: false,
    target: place.outbound,
    targetKind: RULE_TARGET.Outbound,
    targetDetail: null,
    isCatchAll: true,
    recognized: true,
    searchText: place.outbound,
  };
}

/**
 * Set tags the rule refers to itself, without nested branches. The string
 * `"rule_set": "x"` arrives as a list of one tag.
 */
export function ruleSetsOf(rule: RuleRow): string[] {
  return rule.matchers.find((matcher) => matcher.key === RULE_SET_MATCHER)?.values ?? [];
}
