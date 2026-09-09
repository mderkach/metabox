/**
 * Сетка строки списка. Обычная строка и закреплённый `route.final` обязаны
 * совпадать по колонкам: они стоят друг под другом, и разъехавшаяся ширина
 * читается как разные таблицы.
 */
export const RULE_COLUMN = {
  Index: "w-6 shrink-0 text-right font-mono text-xs text-muted-foreground",
  Target: "w-44 shrink-0 truncate font-mono text-sm font-medium",
  Row: "flex items-center gap-3 px-3.5 py-3.5",
} as const
