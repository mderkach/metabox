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
}: {
  label: string;
  /** `null` means the snapshot has not arrived yet: a skeleton, not a dash or zero. A dash means there is no quantity at all. */
  value: string | null;
  context: string | null;
  tone?: string;
  meter?: number;
  /** A row under the number across the full tile width. */
  chart?: ReactNode;
}) {
  return (
    <li className='flex flex-col gap-1 bg-card px-4 py-3.5'>
      <dl className='flex flex-col gap-0.5'>
        <dt className='text-xs text-muted-foreground'>{label}</dt>
        <dd className={cn('text-xl font-semibold tabular-nums', tone)}>
          {value ?? <Skeleton aria-hidden='true' className={cn('h-7 w-24', PENDING_REVEAL)} />}
        </dd>
      </dl>
      {context === null ? (
        <Skeleton aria-hidden='true' className={cn('h-4 w-32', PENDING_REVEAL)} />
      ) : (
        <p className='text-xs text-muted-foreground'>{context}</p>
      )}
      {chart}
      {meter !== undefined && (
        <span className='block h-1 overflow-hidden rounded-full bg-meter-track'>
          <span
            className='block h-full rounded-full bg-primary'
            style={{ width: `${String(Math.min(1, meter) * PERCENT)}%` }}
          />
        </span>
      )}
    </li>
  );
}
