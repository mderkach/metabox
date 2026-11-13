import type { JSONPath } from 'jsonc-parser';

import {
  selectConfigCurrent,
  ConfigDocumentStore,
  findValue,
  readRuleNames,
  ruleNodePath,
  toElementName,
} from '@entities/Config';
import { deviceLabel, type DeviceIndex } from '@entities/Device';
import {
  RULE_SET_MATCHER,
  RULE_TARGET,
  schemaActionFields,
  ruleSetsOf,
  toRuleRowsFromNodes,
  type RuleRow,
} from '@entities/Rule';

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
    name: rule.name ?? '',
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
 * held back because `withRemovals` is off. The name is not held back: it is a
 * comment line, there is no key order to keep.
 *
 * A rule not in the document yet goes to `onCreate` once it has a condition
 * or a set: without them it would take all traffic. A name typed before that
 * is written right after it, if `onCreate` reports the rule written.
 */
export function writeRuleEdit(
  edit: (path: JSONPath, value: unknown) => void,
  rename: (path: JSONPath, name: string) => void,
  index: number,
  patch: RuleEditPatch,
  values: RuleEditModel,
  withRemovals: boolean,
  onCreate?: (node: Record<string, unknown>) => boolean
): boolean {
  if (onCreate !== undefined) {
    const node = toNewRuleNode(patch);

    // A refused insert leaves another rule at this position: the name must not go to it.
    if (node !== null && onCreate(node)) {
      if (toElementName(values.name).length > 0) {
        rename(ruleNodePath(index), values.name);
      }
    }

    return false;
  }

  const path = ruleNodePath(index);
  const text = selectConfigCurrent(ConfigDocumentStore.getState()) ?? '';
  const node = findValue(text, path);
  const current = toRuleRowsFromNodes([node], [readRuleNames(text).at(index - 1) ?? null]).at(0);

  if (current === undefined) {
    return false;
  }

  const before = toRuleEditValues(current);
  let held = false;

  if (toElementName(values.name) !== before.name) {
    rename(path, values.name);
  }

  // `route` without an `action` key is the norm: the key is written only when the action changed.
  if (values.action !== before.action) {
    edit([...path, 'action'], patch.action);

    // The schema branch of each action is strict: a field left from the previous one makes the node invalid.
    const kept = schemaActionFields(values.action);

    for (const field of schemaActionFields(before.action)) {
      if (!kept.includes(field) && typeof node === 'object' && node !== null && field in node) {
        edit([...path, field], undefined);
      }
    }
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

/**
 * The node action the form does not edit (`resolve`, `bypass`, `route-options`),
 * or `null`. The form would show such a rule as `route` and write fields its
 * action does not have.
 */
export function actionOutsideForm(node: unknown): string | null {
  const action: unknown = typeof node === 'object' && node !== null ? Reflect.get(node, 'action') : undefined;

  return typeof action !== 'string' || isFormAction(action) ? null : action;
}

function isFormAction(action: string): action is RuleEditModel['action'] {
  return Object.values(RULE_ACTION).some((known) => known === action);
}

function isKnownAction(rule: RuleRow): rule is RuleRow & { target: RuleEditModel['action'] } {
  return rule.targetKind === RULE_TARGET.Action && isFormAction(rule.target);
}

/** Mask of one address: a rule by device is a rule by its whole address. */
const HOST_PREFIX = { V4: '/32', V6: '/128' } as const;

export function toHostCidr(ip: string): string {
  return `${ip}${ip.includes(':') ? HOST_PREFIX.V6 : HOST_PREFIX.V4}`;
}

/** Address of a source condition value if it is exactly one host; a subnet does not count as a device. */
function toHostIp(value: string): string {
  return value.endsWith(HOST_PREFIX.V4) || value.endsWith(HOST_PREFIX.V6)
    ? value.slice(0, value.lastIndexOf('/'))
    : value;
}

/** Device name for a source condition chip; a device known only by its address has none. */
export function sourceDeviceName(value: string, devices: DeviceIndex): string | undefined {
  const ip = toHostIp(value);
  const label = deviceLabel(ip, devices);

  return label === ip ? undefined : label;
}

/** Names of the source devices whose dynamic lease may move them to another address. */
export function dynamicSourceNames(values: readonly string[], devices: DeviceIndex): string[] {
  const names = values.flatMap((value) => {
    const ip = toHostIp(value);
    const device = devices.get(ip);

    return device === undefined || device.static ? [] : [deviceLabel(ip, devices)];
  });

  return [...new Set(names)];
}
