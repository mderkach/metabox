/**
 * Device row layout. One set of widths for the header and the row: if they diverge,
 * the labels end up above the wrong columns. Below md the row wraps into a card.
 */
export const DEVICES_COLUMN = {
  Row: 'flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-4 py-3 last:border-b-0',
  Label: 'flex min-w-0 grow basis-40 items-center gap-2',
  Ip: 'w-32 shrink-0 font-mono text-xs max-md:w-auto',
  Mac: 'w-36 shrink-0 font-mono text-xs text-muted-foreground max-md:w-auto',
  Lease: 'flex w-44 shrink-0 items-center gap-2 max-md:w-auto',
  Online: 'w-20 shrink-0 text-xs max-md:w-auto',
  Route: 'flex w-56 shrink-0 items-center gap-2 max-md:w-auto',
  /** Value label on the card: the header is not visible on a narrow screen. */
  CardLabel: 'text-xs text-muted-foreground md:hidden',
  RowActions: 'flex w-28 shrink-0 items-center justify-end max-md:w-auto max-md:grow',
} as const;
