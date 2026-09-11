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
  /** Условия и цель одной строкой — по ней ищет поиск таблицы. */
  searchText: string;
}
