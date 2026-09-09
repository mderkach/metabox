export interface RuleMatcher {
  key: string
  values: string[]
}

export const RULE_TARGET = {
  Outbound: "outbound",
  Action: "action",
} as const

export type RuleTargetKind = (typeof RULE_TARGET)[keyof typeof RULE_TARGET]

export interface RuleRow {
  /** Позиция в списке: собственного идентификатора у правил sing-box нет. */
  id: string
  /** Номер в `route.rules`, считая с единицы. */
  index: number
  matchers: RuleMatcher[]
  target: string
  targetKind: RuleTargetKind
  isCatchAll: boolean
  /** Условия и цель одной строкой — по ней ищет поиск таблицы. */
  searchText: string
}
