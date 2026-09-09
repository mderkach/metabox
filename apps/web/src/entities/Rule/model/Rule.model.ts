/** Условие правила: имя поля sing-box и его значения, всегда списком. */
export interface RuleMatcher {
  key: string
  values: string[]
}

/**
 * На что правило отправляет трафик. `action` и `outbound` живут в одном поле
 * строки, потому что в списке это одна колонка: `hijack-dns` и `direct` для
 * читателя одинаково «куда ушло», хотя в схеме это разные ветки union.
 */
export const RULE_TARGET = {
  Outbound: "outbound",
  Action: "action",
} as const

export type RuleTargetKind = (typeof RULE_TARGET)[keyof typeof RULE_TARGET]

/** Строка списка правил — плоское представление узла `route.rules[i]`. */
export interface RuleRow {
  /**
   * Пока это позиция: у правил sing-box нет собственного идентификатора.
   * Когда появится стор документа, ключ придёт оттуда — иначе перестановка
   * строк заставит React переиспользовать не те узлы.
   */
  id: string
  /** Номер в `route.rules`, с единицы: пользователь считает правила от первого. */
  index: number
  matchers: RuleMatcher[]
  target: string
  targetKind: RuleTargetKind
  /** Правило без условий срабатывает на всё — в списке это надо показывать особо. */
  isCatchAll: boolean
  /**
   * Условия и цель одной строкой — по ней ищет поиск. Собирается при разборе
   * конфига, а не в аксессоре таблицы: на 500 правилах склейка на каждый
   * рендер попадает в бюджет отзывчивости из NFR-2.
   */
  searchText: string
}
