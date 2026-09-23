import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { COUNT_STEPS, toAreaGeometry, toValueScale } from '@shared/lib/chart';
import { SECONDS_IN_MINUTE } from '@shared/lib/time';
import { useStickyCeiling } from '@shared/lib/useStickyCeiling';
import { Card, CardContent, CardHeader, SECTION_LABEL, SkeletonRows } from '@shared/ui';

/** Координаты в долях области: сетка растягивается по месту, подписи остаются HTML. */
const PLOT = 100;

/** Линии сетки: по ним читается половина и четверти пика. */
const QUARTERS = 4;
const GRID = Array.from({ length: QUARTERS - 1 }, (_, index) => ((index + 1) * PLOT) / QUARTERS);

/** Отсечки времени, секунды назад: минута делится на четыре шага. */
const TICK_STEPS = 4;
const TIME_TICKS = Array.from(
  { length: TICK_STEPS + 1 },
  (_, index) => SECONDS_IN_MINUTE - (index * SECONDS_IN_MINUTE) / TICK_STEPS
);

/**
 * Открытые соединения за минуту. Живой буфер копит панель, а открывается он
 * минутой, которую держит демон: рантайм отдаёт только снимок живых.
 */
export function ConnectionHistory({ samples }: { samples: number[] }) {
  const { t } = useTranslation('widgets/ConnectionHistory');
  const peak = Math.max(...samples, 1);
  // Подписана верхняя кромка, а не пик: геометрия строится от потолка, и пик,
  // напечатанный у края, обещал бы ряду высоту, которой он не достигает.
  // Кромка круглая с запасом на колебания: число соединений гуляет каждую
  // секунду, и кромка по пику меняла бы подпись оси на каждом кадре.
  const ceiling = useStickyCeiling(toValueScale(peak, COUNT_STEPS).ceiling);
  const geometry = toAreaGeometry(samples, ceiling, PLOT, PLOT);
  const gradient = useId();

  return (
    <Card className='gap-3'>
      <CardHeader>
        <h3 className={SECTION_LABEL}>{t('title')}</h3>
      </CardHeader>

      <CardContent>
        <figure className='flex flex-col gap-1.5'>
          <div className='flex gap-3'>
            <div className='flex w-10 shrink-0 flex-col justify-between py-0.5 text-right font-mono text-xs text-muted-foreground tabular-nums'>
              <span>{ceiling}</span>
              <span>0</span>
            </div>

            {geometry === null ? (
              <SkeletonRows rows={1} rowClassName='h-32' className='min-w-0 grow p-0' />
            ) : (
              <svg
                viewBox={`0 0 ${String(PLOT)} ${String(PLOT)}`}
                preserveAspectRatio='none'
                role='img'
                aria-label={t('chart', { peak: t('count.connection', { ns: 'shared', count: peak }) })}
                className='h-32 min-w-0 grow'
              >
                <defs>
                  <linearGradient id={gradient} x1='0' y1='0' x2='0' y2='1'>
                    <stop offset='0%' stopColor='var(--primary)' stopOpacity='0.28' />
                    <stop offset='100%' stopColor='var(--primary)' stopOpacity='0.02' />
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

                <path d={geometry.area} fill={`url(#${gradient})`} stroke='none' />
                <polyline
                  points={geometry.line}
                  fill='none'
                  strokeWidth={1.5}
                  strokeLinejoin='round'
                  vectorEffect='non-scaling-stroke'
                  className='stroke-primary'
                />
              </svg>
            )}
          </div>

          <figcaption className='flex gap-3 font-mono text-xs text-muted-foreground'>
            <span className='w-10 shrink-0' aria-hidden='true' />
            <span className='flex min-w-0 grow justify-between'>
              {TIME_TICKS.map((tick) => (
                <span key={tick}>
                  {tick === 0 ? t('chart.now', { ns: 'shared' }) : t('chart.ago', { ns: 'shared', value: tick })}
                </span>
              ))}
            </span>
          </figcaption>
        </figure>
      </CardContent>
    </Card>
  );
}
