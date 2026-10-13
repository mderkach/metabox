import { useId } from 'react';

import { toAreaGeometry, toSparkCeiling } from '@shared/lib/chart';
import { cn } from '@shared/lib/utils';

const WIDTH = 120;
const HEIGHT = 26;

/**
 * A series without axes. The scale starts from zero, not from the series minimum: for load and
 * temperature the spread is small relative to the value itself, and from the minimum a calm
 * series would look like a saw.
 *
 * `capacity` is the top of the scale (`toSparkCeiling`): without it 5% of memory would be drawn
 * at the top edge, because the top would be the peak of the series itself.
 */
export function DaemonSparkline({
  samples,
  label,
  tone,
  capacity,
  className,
}: {
  samples: number[];
  label: string;
  tone?: string;
  capacity?: number;
  /** Size in place: the drawing stretches to it, the line thickness does not. */
  className?: string;
}) {
  const peak = Math.max(...samples, 0);
  const geometry = toAreaGeometry(samples, toSparkCeiling(peak, capacity), WIDTH, HEIGHT);
  const gradient = useId();

  if (geometry === null || peak === 0) {
    return null;
  }

  return (
    <svg
      viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
      preserveAspectRatio='none'
      role='img'
      aria-label={label}
      className={cn('h-6.5 w-30 shrink-0', tone ?? 'text-primary', className)}
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
        vectorEffect='non-scaling-stroke'
        className='stroke-current'
      />
    </svg>
  );
}
