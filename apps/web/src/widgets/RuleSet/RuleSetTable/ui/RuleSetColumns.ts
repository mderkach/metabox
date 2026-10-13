/**
 * Rule set row layout. One set of widths serves the header and the row: if they diverge,
 * labels end up above the wrong columns.
 */
export const RULE_SET_COLUMN = {
  Row: 'flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-4 py-3 last:border-b-0',
  Tag: 'flex min-w-0 grow basis-56 flex-col gap-1',
  Source: 'flex min-w-0 grow basis-64 flex-col gap-0.5 text-xs text-muted-foreground',
  Usage: 'w-36 shrink-0 text-right max-md:w-auto max-md:grow max-md:text-left',
  RowActions: 'flex w-14 shrink-0 items-center justify-end gap-2',
} as const;
