import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { toAreaGeometry } from '@shared/lib/chart';
import { Card, CardContent, CardHeader, SECTION_LABEL, SkeletonRows } from '@shared/ui';

/** Координаты в долях области: сетка растягивается по месту, подписи остаются HTML. */
const PLOT = 100;

/** Запас над пиком: без него ровный ряд заливает область целиком. */
const HEADROOM = 1.2;

/** Линии сетки: по ним читается половина и четверти пика. */
const QUARTERS = 4;
const GRID = Array.from({ length: QUARTERS - 1 }, (_, index) => ((index + 1) * PLOT) / QUARTERS);

/** Отсечки времени: минута делится на четыре шага по пятнадцать секунд. */
const TIME_TICKS = ['tick.minus60', 'tick.minus45', 'tick.minus30', 'tick.minus15', 'tick.now'] as const;

/**
 * Открытые соединения за минуту. Буфер копит панель: рантайм отдаёт только
 * снимок живых, и число открытых в прошлую секунду нигде не хранится.
 */
export function ConnectionHistory({ samples }: { samples: number[] }) {
  const { t } = useTranslation('widgets/ConnectionHistory');
  const peak = Math.max(...samples, 1);
  // Подписана верхняя кромка, а не пик: геометрия строится от потолка, и пик,
  // напечатанный у края, обещал бы ряду высоту, которой он не достигает.
  const ceiling = Math.ceil(peak * HEADROOM);
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
                <span key={tick}>{t(tick)}</span>
              ))}
            </span>
          </figcaption>
        </figure>
      </CardContent>
    </Card>
  );
}
