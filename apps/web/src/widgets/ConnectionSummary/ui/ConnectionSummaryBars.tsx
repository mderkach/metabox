import { useState } from 'react';

import { BYTE_STEPS, toPercents, toShare, toValueScale } from '@shared/lib/chart';
import { useStickyCeiling } from '@shared/lib/useStickyCeiling';
import { cn } from '@shared/lib/utils';
import { Empty, EMPTY_INLINE, EmptyDescription, EmptyHeader, ValueAxis } from '@shared/ui';

const PERCENT = 100;

const ROW = 'grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1';
const LANE = 'col-span-2 block h-1.5 overflow-hidden rounded-full';

/** Два деления: карточка сводки узкая, и больше подписей в строку не встаёт. */
const AXIS_INTERVALS = 2;

export interface SummaryBar {
  key: string;
  label: string;
  /** Величина в байтах или байтах в секунду: от неё и длина столбца на шкале, и доля от суммы. */
  value: number;
  /** Правая подпись строки: скорость, число соединений, объём. */
  caption: string;
  /** Класс заливки столбца. */
  tone: string;
}

/**
 * Ряд величин столбцами на шкале с осью. Длина отвечает на «сколько», процент
 * от суммы ряда рядом с величиной — на «какая часть». Строка без величины
 * дорожки не получает: на простаивающем роутере ряд пустых дорожек выглядит
 * как сломанный график.
 *
 * Ряд обновляется раз в секунду, поэтому высота у него не пляшет: строка не
 * переносится, место под дорожку держится и у строки без величины, а под
 * пропавшие строки остаётся место — столько, сколько их уже бывало. Резерв
 * наперёд под весь топ оставлял бы пустую карточку там, где узлов два.
 */
export function ConnectionSummaryBars({
  bars,
  empty,
  format,
}: {
  bars: SummaryBar[];
  empty: string;
  /** Подпись деления оси в единицах величины. */
  format: (value: number) => string;
}) {
  const values = bars.map((bar) => bar.value);
  const peak = values.length === 0 ? 0 : Math.max(...values);
  const ceiling = useStickyCeiling(toValueScale(peak, BYTE_STEPS, AXIS_INTERVALS).ceiling);
  const [rows, setRows] = useState(bars.length);

  if (bars.length > rows) {
    setRows(bars.length);
  }

  if (bars.length === 0) {
    return (
      <Empty className={EMPTY_INLINE}>
        <EmptyHeader>
          <EmptyDescription>{empty}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const percents = toPercents(values);
  const scale = toValueScale(ceiling, BYTE_STEPS, AXIS_INTERVALS);
  const reserved = Math.max(0, rows - bars.length);

  return (
    <div className='flex flex-col gap-2.5'>
      <ul className='flex flex-col gap-2.5'>
        {bars.map((bar, index) => (
          <li key={bar.key} className={ROW}>
            <p className='min-w-0 truncate text-xs' title={bar.label}>
              {bar.label}
            </p>
            <p className='font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums'>
              {bar.caption} · {percents[index]}%
            </p>
            <span className={cn(LANE, bar.value > 0 && 'bg-meter-track')}>
              {bar.value > 0 && (
                <span
                  className={cn('block h-full rounded-full', bar.tone)}
                  style={{ width: `${String(toShare(bar.value, scale.ceiling) * PERCENT)}%` }}
                />
              )}
            </span>
          </li>
        ))}
        {Array.from({ length: reserved }, (_slot, index) => (
          <li key={`slot-${String(index)}`} aria-hidden='true' className={ROW}>
            <p className='text-xs'>&nbsp;</p>
            <span className={LANE} />
          </li>
        ))}
      </ul>
      {/* Без величин ось подписала бы шкалу в один байт: делить нечего. */}
      {peak > 0 && <ValueAxis scale={scale} format={format} />}
    </div>
  );
}
