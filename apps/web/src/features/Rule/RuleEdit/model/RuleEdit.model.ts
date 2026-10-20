import type { JSONPath } from 'jsonc-parser';

import { ConfigDocumentStore, findValue, ruleNodePath } from '@entities/Config';
import { RULE_SET_MATCHER, RULE_TARGET, ruleSetsOf, toRuleRowsFromNodes, type RuleRow } from '@entities/Rule';

import {
  conditionLines,
  RULE_ACTION,
  RULE_CONDITIONS,
  type RuleCondition,
  type RuleEditModel,
  type RuleEditPatch,
} from './RuleEdit.schema';

/** Form values from the node as is: a default added here would reach the diff as an edit nobody made. */
export function toRuleEditValues(rule: RuleRow): RuleEditModel {
  return {
    action: isKnownAction(rule) ? rule.target : RULE_ACTION.Route,
    outbound: rule.targetKind === RULE_TARGET.Outbound ? rule.target : '',
    ruleSet: ruleSetsOf(rule),
    conditions: conditionTexts(rule),
  };
}

/**
 * Writes the fields that differ from the rule in the draft text right now:
 * parsed rows lag the text by a frame, and a value typed and erased back
 * within it must leave the draft too. Returns whether an emptied field was
 * held back because `withRemovals` is off.
 *
 * A rule not in the document yet goes to `onCreate` once it has a condition
 * or a set: without them it would take all traffic.
 */
export function writeRuleEdit(
  edit: (path: JSONPath, value: unknown) => void,
  index: number,
  patch: RuleEditPatch,
  values: RuleEditModel,
  withRemovals: boolean,
  onCreate?: (node: Record<string, unknown>) => void
): boolean {
  if (onCreate !== undefined) {
    const node = toNewRuleNode(patch);

    if (node !== null) {
      onCreate(node);
    }

    return false;
  }

  const path = ruleNodePath(index);
  const current = toRuleRowsFromNodes([findValue(ConfigDocumentStore.getState().current() ?? '', path)]).at(0);

  if (current === undefined) {
    return false;
  }

  const before = toRuleEditValues(current);
  let held = false;

  // `route` without an `action` key is the norm: the key is written only when the action changed.
  if (values.action !== before.action) {
    edit([...path, 'action'], patch.action);
  }

  if (values.action !== before.action || values.outbound !== before.outbound) {
    edit([...path, 'outbound'], 'outbound' in patch ? patch.outbound : undefined);
  }

  const ruleSet = 'rule_set' in patch ? patch.rule_set : undefined;

  if (!sameTags(values.ruleSet, before.ruleSet)) {
    if (withRemovals || ruleSet !== undefined) {
      edit([...path, RULE_SET_MATCHER], ruleSet);
    } else {
      held = true;
    }
  }

  for (const key of RULE_CONDITIONS) {
    const condition = patch.conditions[key];

    if (sameLines(conditionLines(values.conditions[key]), conditionLines(before.conditions[key]))) {
      continue;
    }

    if (withRemovals || condition !== undefined) {
      edit([...path, key], condition);
    } else {
      held = true;
    }
  }

  return held;
}

/** The node of a new rule, conditions first; `null` while it has neither a condition nor a set. */
export function toNewRuleNode(patch: RuleEditPatch): Record<string, unknown> | null {
  const conditions = Object.fromEntries(
    RULE_CONDITIONS.flatMap((key) => (patch.conditions[key] === undefined ? [] : [[key, patch.conditions[key]]]))
  );
  const ruleSet = 'rule_set' in patch ? patch.rule_set : undefined;

  if (Object.keys(conditions).length === 0 && ruleSet === undefined) {
    return null;
  }

  return {
    ...conditions,
    ...(ruleSet === undefined ? {} : { [RULE_SET_MATCHER]: ruleSet }),
    ...(patch.action === RULE_ACTION.Route ? {} : { action: patch.action }),
    ...('outbound' in patch ? { outbound: patch.outbound } : {}),
  };
}

/**
 * All conditions of the rule are form conditions, and there is at least one:
 * clearing them leaves a rule without conditions. `rule_set_ip_cidr_*` flags
 * only refine sets and do not count.
 */
export function hasOnlyEditableConditions(rule: RuleRow): boolean {
  return (
    rule.matchers.length > 0 &&
    rule.matchers.every(
      (matcher) =>
        matcher.key.startsWith(RULE_SET_MATCHER) || RULE_CONDITIONS.some((condition) => condition === matcher.key)
    )
  );
}

export function conditionTexts(rule: RuleRow): Record<RuleCondition, string> {
  const text = (key: RuleCondition) => rule.matchers.find((matcher) => matcher.key === key)?.values.join('\n') ?? '';

  return {
    domain: text('domain'),
    domain_suffix: text('domain_suffix'),
    domain_keyword: text('domain_keyword'),
    ip_cidr: text('ip_cidr'),
    source_ip_cidr: text('source_ip_cidr'),
    port: text('port'),
  };
}

function sameLines(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((line, index) => line === right[index]);
}

/** A set removed and picked again changes only the order: tags compare as sets. */
function sameTags(left: readonly (string | undefined)[], right: readonly (string | undefined)[]): boolean {
  const tags = new Set(left);

  return tags.size === new Set(right).size && right.every((tag) => tags.has(tag));
}

function isKnownAction(rule: RuleRow): rule is RuleRow & { target: RuleEditModel['action'] } {
  return rule.targetKind === RULE_TARGET.Action && Object.values(RULE_ACTION).some((action) => action === rule.target);
}
