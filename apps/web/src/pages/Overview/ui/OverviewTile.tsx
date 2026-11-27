import type { ReactNode } from 'react';

import { cn } from '@shared/lib/utils';
import { PENDING_REVEAL, Skeleton } from '@shared/ui';

export function OverviewTile({
  label,
  value,
  context,
  tone,
  chart,
  absent = false,
}: {
  label: string;
  /** `null` means the snapshot has not arrived yet: a skeleton, not a dash or zero. A dash means there is no quantity at all. */
  value: string | null;
  context: string | null;
  tone?: string;
  /** A row under the number across the full tile width. */
  chart?: ReactNode;
  /** The value will not arrive: a muted dash for the eye, and the context says why. */
  absent?: boolean;
}) {
  return (
    // Label, value, context and chart rows are shared with the neighbouring tiles of the grid row:
    // a label that wraps to two lines moves the neighbour's value down with its own.
    <li className='row-span-4 grid min-w-0 grid-rows-subgrid gap-y-0.5 bg-card px-4 py-3.5'>
      <dl className='contents'>
        <dt className='text-sm font-medium wrap-anywhere text-muted-foreground'>{label}</dt>
        <dd className={cn('text-xl font-semibold wrap-anywhere tabular-nums', tone)}>
          {absent && (
            <span aria-hidden='true' className='font-normal text-muted-foreground'>
              —
            </span>
          )}
          {!absent && (value ?? <Skeleton aria-hidden='true' className={cn('h-7 w-24', PENDING_REVEAL)} />)}
        </dd>
      </dl>
      {context === null ? (
        <Skeleton aria-hidden='true' className={cn('mt-0.5 h-4 w-32', PENDING_REVEAL)} />
      ) : (
        <p className='mt-0.5 text-xs wrap-anywhere text-muted-foreground'>{context}</p>
      )}
      {chart}
    </li>
  );
}
