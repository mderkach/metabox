import { toShare } from '@shared/lib/chart';
import { cn } from '@shared/lib/utils';

export interface SummaryBar {
  key: string;
  label: string;
  /** Доля от `total` задаёт длину столбца. */
  value: number;
  /** Правая подпись строки: скорость, число соединений, доля. */
  caption: string;
  /** Класс заливки столбца. */
  tone: string;
}

const PERCENT = 100;

export function ConnectionSummaryBars({ bars, total, empty }: { bars: SummaryBar[]; total: number; empty: string }) {
  if (bars.length === 0) {
    return <p className='text-xs text-muted-foreground'>{empty}</p>;
  }

  return (
    <ul className='flex flex-col gap-2.5'>
      {bars.map((bar) => (
        <li key={bar.key} className='grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1'>
          <p className='truncate text-xs' title={bar.label}>
            {bar.label}
          </p>
          <p className='font-mono text-xs text-muted-foreground tabular-nums'>{bar.caption}</p>
          <span className='col-span-2 block h-1.5 overflow-hidden rounded-full bg-meter-track'>
            <span
              className={cn('block h-full rounded-full', bar.tone)}
              style={{ width: `${String(toShare(bar.value, total) * PERCENT)}%` }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}
