import { BYTE_STEPS, toPercents, toShare, toValueScale } from '@shared/lib/chart';
import { cn } from '@shared/lib/utils';
import { ValueAxis } from '@shared/ui';

const PERCENT = 100;

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
  if (bars.length === 0) {
    return <p className='text-xs text-muted-foreground'>{empty}</p>;
  }

  const values = bars.map((bar) => bar.value);
  const percents = toPercents(values);
  const peak = Math.max(...values);
  const scale = toValueScale(peak, BYTE_STEPS, AXIS_INTERVALS);

  return (
    <div className='flex flex-col gap-2.5'>
      <ul className='flex flex-col gap-2.5'>
        {bars.map((bar, index) => (
          <li key={bar.key} className='grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1'>
            <p className='truncate text-xs' title={bar.label}>
              {bar.label}
            </p>
            <p className='font-mono text-xs text-muted-foreground tabular-nums'>
              {bar.caption} · {percents[index]}%
            </p>
            {bar.value > 0 && (
              <span className='col-span-2 block h-1.5 overflow-hidden rounded-full bg-meter-track'>
                <span
                  className={cn('block h-full rounded-full', bar.tone)}
                  style={{ width: `${String(toShare(bar.value, scale.ceiling) * PERCENT)}%` }}
                />
              </span>
            )}
          </li>
        ))}
      </ul>
      {/* Без величин ось подписала бы шкалу в один байт: делить нечего. */}
      {peak > 0 && <ValueAxis scale={scale} format={format} />}
    </div>
  );
}
