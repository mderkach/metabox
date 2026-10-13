/**
 * Rule row layout. One set of widths serves the header and the row:
 * if they diverge, labels end up above the wrong columns.
 */
export const RULE_COLUMN = {
  Index: 'w-6 shrink-0 text-right',
  /**
   * Conditions do not stretch across the whole row: on a wide screen the outbound would otherwise slide to
   * the right edge, leaving over 700px between them, where the eye loses the row.
   */
  Conditions: 'flex min-w-0 grow flex-wrap items-center gap-1.5 lg:max-w-xl',
  TargetGroup: 'flex shrink-0 items-center gap-3',
  /** Hit count: at the right edge, separate from the "conditions → outbound" pair. */
  Hits: 'ml-auto w-20 shrink-0 text-right',
  /** On a wide screen the outbound is wider: there is room, and a long node tag is not cut off needlessly. */
  Target: 'w-auto shrink-0 sm:w-44 xl:w-64',
  /** Width of the "conditions → outbound" arrow. In the header an empty space takes its place. */
  Arrow: 'size-4 shrink-0',
  Row: 'relative flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3.5 py-3',
} as const;
