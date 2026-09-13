import { useId } from 'react';

import { toAreaGeometry } from '@shared/lib/chart';

const WIDTH = 120;
const HEIGHT = 26;

/** Запас над пиком: без него ровный ряд прижимается к верхней кромке. */
const HEADROOM = 1.15;

/**
 * Ряд без осей. Шкала идёт от нуля, а не от минимума ряда: у загрузки и
 * температуры разброс мал относительно самой величины, и от минимума спокойный
 * ряд выглядел бы пилой.
 */
export function DaemonSparkline({ samples, label, tone }: { samples: number[]; label: string; tone?: string }) {
  const peak = Math.max(...samples, 0);
  const geometry = toAreaGeometry(samples, peak * HEADROOM, WIDTH, HEIGHT);
  const gradient = useId();

  if (geometry === null || peak === 0) {
    return null;
  }

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
      role='img'
      aria-label={label}
      className={tone ?? 'text-primary'}
    >
      <defs>
        <linearGradient id={gradient} x1='0' y1='0' x2='0' y2='1'>
          <stop offset='0%' stopColor='currentColor' stopOpacity='0.25' />
          <stop offset='100%' stopColor='currentColor' stopOpacity='0.02' />
        </linearGradient>
      </defs>

      <path d={geometry.area} fill={`url(#${gradient})`} stroke='none' />
      <polyline
        points={geometry.line}
        fill='none'
        strokeWidth={1.25}
        strokeLinejoin='round'
        className='stroke-current'
      />
    </svg>
  );
}
