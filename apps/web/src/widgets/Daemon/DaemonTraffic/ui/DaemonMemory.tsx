import { formatBytes } from '@shared/lib/format';

const WIDTH = 120;
const HEIGHT = 24;

/** По одной точке линию не проведёшь. */
const MIN_POINTS = 2;

/**
 * Память за десять минут. Отдельный спарклайн, а не второй ряд на графике
 * трафика: у них разные единицы, и общая шкала врала бы про обе (одна ось —
 * одна величина).
 */
export function DaemonMemory({ samples }: { samples: number[] }) {
  if (samples.length < MIN_POINTS) {
    return null;
  }

  const peak = Math.max(...samples);
  const floor = Math.min(...samples);
  const span = peak - floor || peak || 1;
  const step = WIDTH / (samples.length - 1);

  const points = samples
    .map((value, index) => `${(step * index).toFixed(1)},${(HEIGHT * (1 - (value - floor) / span)).toFixed(1)}`)
    .join(' ');

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
      role='img'
      aria-label={`Память за десять минут, от ${formatBytes(floor)} до ${formatBytes(peak)}`}
    >
      <polyline points={points} fill='none' strokeWidth={1.5} strokeLinejoin='round' className='stroke-primary/70' />
    </svg>
  );
}
