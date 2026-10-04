export interface RuleMatcher {
  key: string;
  values: string[];
}

/**
 * Ветка логического правила: либо собственные условия, либо снова группа —
 * вложенность в sing-box не ограничена.
 */
export interface RuleBranch {
  matchers: RuleMatcher[];
  group: RuleGroup | null;
}

export interface RuleGroup {
  /** `and` — должны сработать все ветки, `or` — достаточно одной. */
  mode: string;
  /** `invert` переворачивает результат всей группы, а не отдельной ветки. */
  invert: boolean;
  children: RuleBranch[];
}

export const RULE_TARGET = {
  Outbound: 'outbound',
  Action: 'action',
} as const;

export type RuleTargetKind = (typeof RULE_TARGET)[keyof typeof RULE_TARGET];

/**
 * Узел нового правила: без условий, с одним выходом. Пустой узел форк
 * отвергает (`missing conditions`), `action: route` без выхода — тоже
 * (`missing outbound field`), а безусловное правило с выходом `sing-box check`
 * принимает. С выходом в маршрут по умолчанию в конце списка такое правило
 * маршрутизацию не меняет, пока ему не зададут условия.
 */
export function newRuleNode(outbound: string): { outbound: string } {
  return { outbound };
}

export interface RuleRow {
  /** Позиция в списке: собственного идентификатора у правил sing-box нет. */
  id: string;
  /** Номер в `route.rules`, считая с единицы. */
  index: number;
  matchers: RuleMatcher[];
  /** `null` — обычное правило; иначе условия склеены `and` или `or`. */
  group: RuleGroup | null;
  invert: boolean;
  target: string;
  targetKind: RuleTargetKind;
  /** Параметры действия (`method`, `sniffer`, `server`), если они заданы. */
  targetDetail: string | null;
  /**
   * Правило без условий: совпадает со всем и обрывает список. Логическое
   * правило таким не бывает — у него условия во вложенных ветках.
   */
  isCatchAll: boolean;
  /**
   * Узел принят схемой. Ложь означает, что в нём есть поле, которого схема не
   * знает: условия такого узла показаны не полностью, и правится он текстом.
   */
  recognized: boolean;
  /** Условия и цель одной строкой — по ней ищет поиск таблицы. */
  searchText: string;
}
