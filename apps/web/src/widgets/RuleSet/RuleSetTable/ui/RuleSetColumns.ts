/**
 * Rule set row layout. One set of widths serves the header and the row: if they diverge,
 * labels end up above the wrong columns.
 */
export const RULE_SET_COLUMN = {
  /**
   * Below `md` the row is a grid: the actions stand beside the set name instead of
   * wrapping onto a line of their own under the usage.
   */
  Row: 'flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-4 py-3 last:border-b-0 max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto]',
  Tag: 'flex min-w-0 grow basis-56 flex-col gap-1 max-md:row-start-1',
  Source: 'flex min-w-0 grow basis-64 flex-col gap-0.5 text-xs text-muted-foreground max-md:col-span-2',
  Usage: 'w-36 shrink-0 text-right max-md:col-span-2 max-md:w-auto max-md:text-left',
  RowActions:
    'flex w-14 shrink-0 items-center justify-end gap-2 max-md:col-start-2 max-md:row-start-1 max-md:self-start',
} as const;
