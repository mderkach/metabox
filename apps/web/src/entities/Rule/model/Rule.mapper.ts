import type { Config } from '@shared/api/generated';

import { RULE_MATCHER_KEYS } from './Rule.constants';
import { RULE_TARGET, type RuleMatcher, type RuleRow } from './Rule.model';

/** Действие по умолчанию: правило без `action` маршрутизирует. */
const DEFAULT_ACTION = 'route';

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

function toTarget(rule: object): Pick<RuleRow, 'target' | 'targetKind'> {
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

/**
 * Разворачивает `route.rules` в плоские строки списка.
 *
 * Порядок сохраняется дословно: в sing-box он и есть логика — срабатывает
 * первое подходящее правило, а не самое точное.
 */
export function toRuleRows(config: Config | null): RuleRow[] {
  const rules = config?.route?.rules;

  if (rules === undefined) {
    return [];
  }

  return rules.map((rule, position) => {
    const matchers = toMatchers(rule);
    const target = toTarget(rule);

    return {
      id: String(position),
      index: position + 1,
      matchers,
      isCatchAll: matchers.length === 0,
      searchText: [...matchers.flatMap((matcher) => [matcher.key, ...matcher.values]), target.target].join(' '),
      ...target,
    };
  });
}
