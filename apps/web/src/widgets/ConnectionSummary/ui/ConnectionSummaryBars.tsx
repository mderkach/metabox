import { useState } from 'react';

import { BYTE_STEPS, toPercents, toShare, toValueScale } from '@shared/lib/chart';
import { useStickyCeiling } from '@shared/lib/useStickyCeiling';
import { cn } from '@shared/lib/utils';
import { Empty, EMPTY_INLINE, EmptyDescription, EmptyHeader, ValueAxis } from '@shared/ui';

const PERCENT = 100;

const ROW = 'grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1';
const LANE = 'col-span-2 block h-1.5 overflow-hidden rounded-full';

/** Two ticks: the summary card is narrow, and more labels do not fit in a row. */
const AXIS_INTERVALS = 2;

export interface SummaryBar {
  key: string;
  label: string;
  /** Quantity in bytes or bytes per second: both the bar length on the scale and the share of the total come from it. */
  value: number;
  /** The row's second quantity — after the quantity itself and its share: speed or connection count. */
  caption: string;
  /** Bar fill class. */
  tone: string;
}

/**
 * A series of quantities as bars on a scale with an axis. Length answers "how much", the percent
 * of the series total next to the quantity answers "what part". The row caption
 * starts with the same quantity as the scale: otherwise the bar length and the first
 * number of the row would say different things. A row without a quantity
 * gets no track: on an idle router a series of empty tracks looks
 * like a broken chart.
 *
 * The series updates once a second, so its height does not dance: a row does not
 * wrap, space for a track is held for a row without a quantity too, and space
 * stays for vanished rows — as many as there have been. Reserving
 * ahead for the whole top would leave an empty card where there are two nodes.
 */
export function ConnectionSummaryBars({
  bars,
  empty,
  format,
}: {
  bars: SummaryBar[];
  empty: string;
  /** Axis tick label in the quantity's units. */
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
            <p className='min-w-0 text-xs wrap-break-word'>{bar.label}</p>
            <p className='font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums'>
              {format(bar.value)} · {percents[index]}% · {bar.caption}
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
      {/* Without quantities the axis would label the scale at one byte: nothing to divide. */}
      {peak > 0 && <ValueAxis scale={scale} format={format} />}
    </div>
  );
}
