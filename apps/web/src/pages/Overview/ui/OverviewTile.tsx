import type { ReactNode } from 'react';

import { cn } from '@shared/lib/utils';
import { PENDING_REVEAL, Skeleton } from '@shared/ui';

const PERCENT = 100;

/** Полоса рисуется только у величины с потолком: без него шкала не задана. */
export function OverviewTile({
  label,
  value,
  context,
  tone,
  meter,
  chart,
}: {
  label: string;
  /** `null` — снимок ещё не пришёл: скелетон, а не прочерк или ноль. Прочерк — величины нет вовсе. */
  value: string | null;
  context: string | null;
  tone?: string;
  meter?: number;
  /** Ряд под числом во всю ширину плитки. */
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
