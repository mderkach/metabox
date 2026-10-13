/**
 * Log row layout: one for the header and the rows, otherwise the labels end up not above
 * their columns. Below md the message goes under the time and level at full width.
 */
export const LOGS_COLUMN = {
  Row: 'flex w-full flex-wrap items-baseline gap-x-3 px-4 py-1 font-mono text-xs',
  Time: 'w-20 shrink-0 text-muted-foreground',
  Level: 'w-16 shrink-0 uppercase',
  Message: 'min-w-0 grow basis-0 break-words whitespace-pre-wrap max-md:basis-full',
} as const;
