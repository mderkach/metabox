import { toPercents } from '@shared/lib/chart';
import { cn } from '@shared/lib/utils';

export interface SummaryBar {
  key: string;
  label: string;
  /** Доля от суммы ряда задаёт длину столбца. */
  value: number;
  /** Правая подпись строки: скорость, число соединений, объём. */
  caption: string;
  /** Класс заливки столбца. */
  tone: string;
}

/**
 * Ряд долей столбцами.
 *
 * Доля считается от суммы ряда, а не от его лидера: при нормировке к лидеру
 * первая строка всегда полная, и длина перестаёт что-либо значить за пределами
 * одной панели. Процент печатается рядом с величиной — оси у панели нет, и без
 * него длину не с чем сверить.
 */
export function ConnectionSummaryBars({ bars, empty }: { bars: SummaryBar[]; empty: string }) {
  if (bars.length === 0) {
    return <p className='text-xs text-muted-foreground'>{empty}</p>;
  }

  const percents = toPercents(bars.map((bar) => bar.value));

  return (
    <ul className='flex flex-col gap-2.5'>
      {bars.map((bar, index) => (
        <li key={bar.key} className='grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1'>
          <p className='truncate text-xs' title={bar.label}>
            {bar.label}
          </p>
          <p className='font-mono text-xs text-muted-foreground tabular-nums'>
            {bar.caption} · {percents[index]}%
          </p>
          <span className='col-span-2 block h-1.5 overflow-hidden rounded-full bg-meter-track'>
            <span
              className={cn('block h-full rounded-full', bar.tone)}
              style={{ width: `${String(percents[index])}%` }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}
