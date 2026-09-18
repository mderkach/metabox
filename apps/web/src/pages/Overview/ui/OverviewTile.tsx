import type { ReactNode } from 'react';

import { cn } from '@shared/lib/utils';

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
  value: string;
  context: string;
  tone?: string;
  meter?: number;
  /** Ряд под числом: динамика там, где у величины нет потолка. */
  chart?: ReactNode;
}) {
  return (
    <li className='flex flex-col gap-1 bg-card px-4 py-3.5'>
      <dl className='flex flex-col gap-0.5'>
        <dt className='text-xs text-muted-foreground'>{label}</dt>
        <dd className={cn('text-xl font-semibold tabular-nums', tone)}>{value}</dd>
      </dl>
      <div className='flex items-end justify-between gap-2'>
        <p className='text-xs text-muted-foreground'>{context}</p>
        {chart}
      </div>
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
