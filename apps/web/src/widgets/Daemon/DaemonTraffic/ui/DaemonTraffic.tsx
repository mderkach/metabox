import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import type { TrafficSample } from '@entities/Daemon';
import { formatRate } from '@shared/lib/format';

/**
 * Координаты рисуются в долях, а сетка растягивается по месту: подписи осей
 * остаются HTML снаружи SVG. Внутри они масштабировались вместе с областью и на
 * широком экране печатались крупнее заголовка страницы.
 */
const PLOT = 100;

/** Ось посередине: половина области под входящий ряд, половина под исходящий. */
const HALVES = 2;
const MID = PLOT / HALVES;

/** Сотые доли области: точнее округлять незачем, площадь всё равно растягивается. */
const COORD_PRECISION = 2;

/** По одной точке линию не проведёшь. */
const MIN_POINTS = 2;

/** Отсечки времени: минута делится на четыре шага по пятнадцать секунд. */
const TIME_TICKS = ['tick.minus60', 'tick.minus45', 'tick.minus30', 'tick.minus15', 'tick.now'] as const;

/** Середины половин: по ним читается высота всплеска, а не только его форма. */
const QUARTER = MID / HALVES;
const GRID = [QUARTER, PLOT - QUARTER];

function toGeometry(values: number[], peak: number, down: boolean): { line: string; area: string } {
  const step = PLOT / (values.length - 1);
  const points = values.map((value, index) => {
    const offset = MID * (value / peak);

    return `${(step * index).toFixed(COORD_PRECISION)},${(down ? MID - offset : MID + offset).toFixed(COORD_PRECISION)}`;
  });

  return {
    line: points.join(' '),
    area: `M0,${String(MID)} L${points.join(' L')} L${String(PLOT)},${String(MID)} Z`,
  };
}

/**
 * Трафик за минуту двумя зеркальными областями: входящий вверх от оси,
 * исходящий вниз. Половины масштабируются каждая по своему пику — при общей
 * шкале всплеск входящего в сто раз прижимал исходящий к оси, и весь ряд
 * переставал читаться (это ровно то, что видно на живом роутере).
 *
 * Своя графика, а не библиотека: два ряда по шестьдесят точек без интерактива
 * не стоят ста килобайт в бандле.
 */
export function DaemonTraffic({
  samples,
  ticks,
  window,
}: {
  samples: TrafficSample[];
  /** Подписи оси времени, слева направо. */
  ticks?: string[];
  /** Окно графика словами: уходит в доступное имя картинки. */
  window?: string;
}) {
  const { t } = useTranslation('widgets/Daemon/DaemonTraffic');
  const timeTicks = ticks ?? TIME_TICKS.map((tick) => t(tick));
  const timeWindow = window ?? t('window.minute');
  const down = samples.map((sample) => sample.down);
  const up = samples.map((sample) => sample.up);
  const peakDown = Math.max(...down, 1);
  const peakUp = Math.max(...up, 1);
  const enough = samples.length >= MIN_POINTS;

  const downGeometry = enough ? toGeometry(down, peakDown, true) : null;
  const upGeometry = enough ? toGeometry(up, peakUp, false) : null;
  // Ссылка `url(#id)` разрешается по документу: два графика на странице с общим
  // id отдали бы заливку первого обоим.
  const gradient = useId();

  return (
    <figure className='flex flex-col gap-1.5'>
      <div className='flex gap-3'>
        <div className='flex w-20 shrink-0 flex-col justify-between py-0.5 text-right font-mono text-xs tabular-nums'>
          <span className='text-series-down'>{formatRate(peakDown)}</span>
          <span className='text-muted-foreground'>0</span>
          <span className='text-series-up'>{formatRate(peakUp)}</span>
        </div>

        <svg
          viewBox={`0 0 ${String(PLOT)} ${String(PLOT)}`}
          preserveAspectRatio='none'
          role='img'
          aria-label={t('chart.label', { window: timeWindow, down: formatRate(peakDown), up: formatRate(peakUp) })}
          className='h-44 min-w-0 grow'
        >
          <defs>
            <linearGradient id={`${gradient}-down`} x1='0' y1='0' x2='0' y2='1'>
              <stop offset='0%' stopColor='var(--series-down)' stopOpacity='0.3' />
              <stop offset='100%' stopColor='var(--series-down)' stopOpacity='0.02' />
            </linearGradient>
            <linearGradient id={`${gradient}-up`} x1='0' y1='1' x2='0' y2='0'>
              <stop offset='0%' stopColor='var(--series-up)' stopOpacity='0.3' />
              <stop offset='100%' stopColor='var(--series-up)' stopOpacity='0.02' />
            </linearGradient>
          </defs>

          {GRID.map((line) => (
            <line
              key={line}
              x1='0'
              y1={line}
              x2={PLOT}
              y2={line}
              vectorEffect='non-scaling-stroke'
              className='stroke-border'
              strokeWidth={1}
              strokeDasharray='2 3'
            />
          ))}

          <line
            x1='0'
            y1={MID}
            x2={PLOT}
            y2={MID}
            vectorEffect='non-scaling-stroke'
            className='stroke-border'
            strokeWidth={1}
          />

          {downGeometry !== null && (
            <g>
              <path d={downGeometry.area} fill={`url(#${gradient}-down)`} stroke='none' />
              <polyline
                points={downGeometry.line}
                fill='none'
                strokeWidth={1.5}
                strokeLinejoin='round'
                vectorEffect='non-scaling-stroke'
                className='stroke-series-down'
              />
            </g>
          )}

          {upGeometry !== null && (
            <g>
              <path d={upGeometry.area} fill={`url(#${gradient}-up)`} stroke='none' />
              <polyline
                points={upGeometry.line}
                fill='none'
                strokeWidth={1.5}
                strokeLinejoin='round'
                vectorEffect='non-scaling-stroke'
                className='stroke-series-up'
              />
            </g>
          )}
        </svg>
      </div>

      {/* Подпись времени идёт той же сеткой, что и график: посчитанный вручную
          отступ уехал бы от смены ширины колонки подписей или зазора. */}
      <figcaption className='flex gap-3 font-mono text-xs text-muted-foreground'>
        <span className='w-20 shrink-0' aria-hidden='true' />
        <span className='flex min-w-0 grow justify-between'>
          {timeTicks.map((tick) => (
            <span key={tick}>{tick}</span>
          ))}
        </span>
      </figcaption>
    </figure>
  );
}
