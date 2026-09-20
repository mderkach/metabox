/**
 * Раскладка строки правила. Ширины держит один набор на шапку и на строку:
 * разойдясь, подписи встанут не над своими колонками.
 */
export const RULE_COLUMN = {
  Index: 'w-6 shrink-0 text-right',
  Conditions: 'flex min-w-0 grow flex-wrap items-center gap-1.5',
  TargetGroup: 'flex shrink-0 items-center gap-3',
  Target: 'w-auto shrink-0 sm:w-44',
  /** Ширина стрелки «условия → исход». В шапке её занимает пустое место. */
  Arrow: 'size-4 shrink-0',
  Row: 'relative flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3.5 py-3',
} as const;
