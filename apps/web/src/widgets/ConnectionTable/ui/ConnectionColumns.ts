/**
 * Колонки таблицы соединений. Ширины распределены по длине содержимого: хост
 * короткий, а цепочка узлов — самое длинное поле строки.
 */
export const CONNECTION_COLUMN = {
  Row: 'flex min-w-3xl items-center gap-3 border-b border-border px-3.5 py-2 text-sm',
  Host: 'w-64 shrink-0',
  Route: 'min-w-0 grow',
  Traffic: 'w-32 shrink-0 text-right',
  Age: 'w-14 shrink-0 text-right',
  Close: 'w-7 shrink-0',
} as const;
