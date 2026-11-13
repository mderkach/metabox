import type { ReactNode } from 'react';

import { cn } from '@shared/lib/utils';
import { PENDING_REVEAL, Skeleton } from '@shared/ui';

const PERCENT = 100;

/** The bar is drawn only for a quantity with a ceiling: without one the scale is undefined. */
export function OverviewTile({
  label,
  value,
  context,
  tone,
  meter,
  chart,
  wide,
}: {
  label: string;
  /** `null` means the snapshot has not arrived yet: a skeleton, not a dash or zero. A dash means there is no quantity at all. */
  value: string | null;
  context: string | null;
  tone?: string;
  meter?: number;
  /** A row under the number across the full tile width. */
  chart?: ReactNode;
  /** Spans the whole row of a two-column grid. */
  wide?: boolean;
}) {
  return (
    // Label, value, context and chart rows are shared with the neighbouring tiles of the grid row:
    // a label that wraps to two lines moves the neighbour's value down with its own.
    <li
      className={cn('row-span-4 grid grid-rows-subgrid gap-y-0.5 bg-card px-4 py-3.5', wide === true && 'col-span-2')}
    >
      <dl className='contents'>
        <dt className='text-sm font-medium text-muted-foreground'>{label}</dt>
        <dd className={cn('text-xl font-semibold tabular-nums', tone)}>
          {value ?? <Skeleton aria-hidden='true' className={cn('h-7 w-24', PENDING_REVEAL)} />}
        </dd>
      </dl>
      {context === null ? (
        <Skeleton aria-hidden='true' className={cn('mt-0.5 h-4 w-32', PENDING_REVEAL)} />
      ) : (
        <p className='mt-0.5 text-xs text-muted-foreground'>{context}</p>
      )}
      {chart}
      {meter !== undefined && (
        <span className='mt-0.5 block h-1 self-start overflow-hidden rounded-full bg-meter-track'>
          <span
            className='block h-full rounded-full bg-primary'
            style={{ width: `${String(Math.min(1, meter) * PERCENT)}%` }}
          />
        </span>
      )}
    </li>
  );
}
