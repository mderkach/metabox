import { z } from 'zod';

import { countGroups } from '@shared/lib/group';
import { matchesWords, toQueryWords } from '@shared/lib/search';

import { RULE_SET_MATCHER } from './Rule.constants';
import type { RuleBranch, RuleRow } from './Rule.model';

/** Выход, по которому отбираются правила; `null` — все сразу. */
export type RuleTargetFilter = string | null;

/** Тег сета, на который ссылаются отобранные правила; `null` — все сразу. */
export type RuleSetFilter = string | null;

/**
 * Состояние экрана правил в адресе. Номер правила — как в UI, с единицы: экран
 * соединений ведёт по нему на сработавший узел. Сет — отбор, с которым приходят
 * из каталога наборов: «кто пользуется этим сетом».
 */
export const RuleSearchSchema = z.object({
  rule: z.coerce.number().int().positive().optional(),
  rule_set: z.coerce.string().min(1).optional(),
});

export type RuleSearch = z.infer<typeof RuleSearchSchema>;

/** Непонятое значение отбрасывается целиком: половина отбора хуже, чем его отсутствие. */
export function parseRuleSearch(search: Record<string, unknown>): RuleSearch {
  const parsed = RuleSearchSchema.safeParse(search);

  return parsed.success ? parsed.data : {};
}

export interface RuleTargetGroup {
  target: string;
  count: number;
}

/** Выходы в порядке убывания числа правил: по ним собираются фасеты экрана. */
export function toTargetGroups(rules: RuleRow[]): RuleTargetGroup[] {
  return countGroups(rules, (rule) => rule.target).map((group) => ({ target: group.value, count: group.count }));
}

/**
 * Ссылается ли ветка на сет. Логическое правило ссылается на него из вложенных
 * веток, и считается это так же, как прямая ссылка, — иначе отбор разошёлся бы
 * с отметкой использования в каталоге наборов.
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
