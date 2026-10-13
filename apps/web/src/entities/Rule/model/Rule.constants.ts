import { DefaultRuleBaseSchema } from '@shared/api/generated';

/**
 * Fields a rule has that are not conditions: `type` names the union branch,
 * `invert` flips the result of the already assembled conditions.
 */
const NOT_MATCHER_KEYS = new Set(['type', 'invert']);

/**
 * Condition field names. Taken from the generated schema, not rewritten by
 * hand: the rule base in the fork schema is exactly the set of conditions, and
 * actions are added on top of it as branches. A new matcher in the fork will
 * appear here by itself.
 *
 * A logical rule does not fall under this: its conditions lie in nested
 * `rules`, which the base does not have; `Rule.adapter` parses them.
 */
export const RULE_MATCHER_KEYS: readonly string[] = Object.keys(DefaultRuleBaseSchema.shape).filter(
  (key) => !NOT_MATCHER_KEYS.has(key)
);

/**
 * The condition by which a rule refers to sets from `route.rule_set`. The
 * `rule_set_ip_cidr_*` flags start the same way but are not conditions: they
 * refine how to match set addresses.
 */
export const RULE_SET_MATCHER = 'rule_set';

/**
 * Fields that refine the action. Shown next to it: `reject` without `method`
 * and `reject` with `method: drop` behave differently, but would look the same
 * in the list.
 */
export const RULE_ACTION_FIELDS: Readonly<Partial<Record<string, readonly string[]>>> = {
  reject: ['method'],
  sniff: ['sniffer', 'timeout'],
  resolve: ['server', 'strategy'],
};
