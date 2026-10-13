import { RuleSchema, type Config } from '@shared/api/generated';
import { describeIssues } from '@shared/lib/schemaIssues';

import { RULE_ACTION_FIELDS, RULE_MATCHER_KEYS } from './Rule.constants';
import { RULE_TARGET, type RuleBranch, type RuleGroup, type RuleMatcher, type RuleRow } from './Rule.model';

/** Default action: a rule without `action` routes. */
const DEFAULT_ACTION = 'route';

/** Value of the union branch for a logical rule. */
const LOGICAL_TYPE = 'logical';

function toValues(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item));
  }

  return [String(raw)];
}

function toMatchers(rule: object): RuleMatcher[] {
  const matchers: RuleMatcher[] = [];

  for (const key of RULE_MATCHER_KEYS) {
    const raw: unknown = Reflect.get(rule, key);

    if (raw === undefined || raw === null) {
      continue;
    }

    matchers.push({ key, values: toValues(raw) });
  }

  return matchers;
}

function isLogical(rule: object): boolean {
  return Reflect.get(rule, 'type') === LOGICAL_TYPE;
}

/**
 * Logical rule conditions lie in nested `rules`, not in the rule itself.
 * Without parsing the nesting such a rule would look like a rule without
 * conditions, that is, one that intercepts all traffic, and the user would
 * decide that nothing below it runs.
 */
function toGroup(rule: object): RuleGroup | null {
  if (!isLogical(rule)) {
    return null;
  }

  const nested: unknown = Reflect.get(rule, 'rules');
  const children: RuleBranch[] = Array.isArray(nested)
    ? nested.filter((child): child is object => typeof child === 'object' && child !== null).map(toBranch)
    : [];

  return {
    mode: String(Reflect.get(rule, 'mode') ?? 'and'),
    invert: Reflect.get(rule, 'invert') === true,
    children,
  };
}

function toBranch(rule: object): RuleBranch {
  return { matchers: toMatchers(rule), group: toGroup(rule) };
}

export function toTarget(rule: object): Pick<RuleRow, 'target' | 'targetKind'> {
  const outbound: unknown = Reflect.get(rule, 'outbound');

  if (typeof outbound === 'string' && outbound.length > 0) {
    return { target: outbound, targetKind: RULE_TARGET.Outbound };
  }

  const action: unknown = Reflect.get(rule, 'action');

  return {
    target: typeof action === 'string' ? action : DEFAULT_ACTION,
    targetKind: RULE_TARGET.Action,
  };
}

function toTargetDetail(rule: object, target: string): string | null {
  const fields = RULE_ACTION_FIELDS[target];

  if (fields === undefined) {
    return null;
  }

  const parts: string[] = [];

  for (const field of fields) {
    const raw: unknown = Reflect.get(rule, field);

    if (raw !== undefined && raw !== null) {
      parts.push(`${field}: ${toValues(raw).join(', ')}`);
    }
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}

function toSearchText(branch: RuleBranch): string[] {
  const own = branch.matchers.flatMap((matcher) => [matcher.key, ...matcher.values]);
  const nested = branch.group?.children.flatMap(toSearchText) ?? [];

  return [...own, ...nested];
}

/**
 * Expands `route.rules` into flat list rows.
 *
 * The order is kept verbatim: in sing-box it is the logic, the first matching
 * rule fires, not the most precise one.
 */
export function toRuleRows(config: Config | null): RuleRow[] {
  return toRuleRowsFromNodes(config?.route?.rules ?? []);
}

/**
 * The same over nodes read from the file text.
 *
 * The rules screen must open even when the schema did not accept the whole
 * config: one unfamiliar rule would otherwise hide the whole list, while the
 * user needs exactly to find this rule.
 */
export function toRuleRowsFromNodes(nodes: readonly unknown[]): RuleRow[] {
  const rows: RuleRow[] = [];

  for (const [position, node] of nodes.entries()) {
    // The position is taken in the source array, not the filtered one: an edit
    // addresses the node in the file by it (`route.rules[index - 1]`), and a
    // skipped non-object would shift all the following edits onto other nodes.
    if (typeof node !== 'object' || node === null) {
      continue;
    }

    const branch = toBranch(node);
    const target = toTarget(node);

    rows.push({
      id: String(position),
      index: position + 1,
      matchers: branch.matchers,
      group: branch.group,
      invert: Reflect.get(node, 'invert') === true,
      targetDetail: toTargetDetail(node, target.target),
      isCatchAll: branch.matchers.length === 0 && branch.group === null,
      recognized: isRuleRecognized(node),
      searchText: [...toSearchText(branch), target.target].join(' '),
      ...target,
    });
  }

  return rows;
}

/** The node is accepted by the fork schema: it has a form, not only the text mode. */
export function isRuleRecognized(node: unknown): boolean {
  return RuleSchema.safeParse(node).success;
}

/**
 * Schema remarks on the rule node; empty means the node is accepted.
 *
 * A remark does not forbid writing: the validity arbiter is `sing-box check` on
 * the device, not the panel schema. Otherwise a node the schema does not know
 * could be neither fixed nor saved, and it is edited exactly as text.
 */
export function checkRuleNode(node: unknown): string[] {
  const checked = RuleSchema.safeParse(node);

  if (checked.success) {
    return [];
  }

  return describeIssues(checked.error.issues);
}
