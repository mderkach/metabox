/**
 * Раскладка строки правила. Ширины держит один набор на шапку и на строку:
 * разойдясь, подписи встанут не над своими колонками.
 */
export const RULE_COLUMN = {
  Index: 'w-6 shrink-0 text-right',
  /**
   * Условия не тянутся на всю строку: на широком экране выход иначе уезжал к
   * правому краю, и между ними оставалось больше 700px, на которых глаз теряет строку.
   */
  Conditions: 'flex min-w-0 grow flex-wrap items-center gap-1.5 lg:max-w-xl',
  TargetGroup: 'flex shrink-0 items-center gap-3',
  /** Счёт срабатываний: у правого края, отдельно от пары «условия → выход». */
  Hits: 'ml-auto w-20 shrink-0 text-right',
  Target: 'w-auto shrink-0 sm:w-44',
  /** Ширина стрелки «условия → выход». В шапке её занимает пустое место. */
  Arrow: 'size-4 shrink-0',
  Row: 'relative flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3.5 py-3',
} as const;
