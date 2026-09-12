import type { TrafficSample } from '@entities/Daemon';
import { formatRate } from '@shared/lib/format';

const WIDTH = 640;
const HEIGHT = 180;
// Полоса под подписи шкалы: самая широкая — «123.4 МБ/с», десять знаков
// моноширинного шрифта в единицах viewBox, иначе подпись срезается слева.
const PAD_LEFT = 68;
const PAD_BOTTOM = 20;
const PAD_TOP = 10;
const TICKS = 3;

/** Подпись центрируется по половине высоты своей строки. */
const LABEL_BASELINE = 3.5;
/** Отступ подписи оси времени от нижнего края. */
const LABEL_BOTTOM = 4;
/** Зазор между подписью шкалы и линией сетки. */
const LABEL_GAP = 8;

function toPoints(values: number[], max: number, count: number): string {
  const plotWidth = WIDTH - PAD_LEFT - PAD_TOP;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const step = count > 1 ? plotWidth / (count - 1) : 0;

  return values
    .map((value, index) => {
      const x = PAD_LEFT + step * index;
      const y = PAD_TOP + plotHeight * (1 - value / max);

      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/**
 * Трафик за минуту. Своя полилиния, а не библиотека графиков: два ряда по
 * шестьдесят точек без интерактива не стоят ста килобайт в бандле.
 *
 * Ряды разведены светлотой, а не цветом: в палитре панели все токены графиков
 * серые, и цветной ряд выбивался бы из неё сильнее, чем помогал.
 */
export function DaemonTraffic({ samples }: { samples: TrafficSample[] }) {
  const down = samples.map((sample) => sample.down);
  const up = samples.map((sample) => sample.up);
  const peak = Math.max(...down, ...up, 1);
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  return (
    <svg
      width='100%'
      viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
      role='img'
      aria-label={`Трафик за минуту, пик ${formatRate(peak)}`}
    >
      {Array.from({ length: TICKS + 1 }, (_, index) => {
        const value = (peak / TICKS) * index;
        const y = PAD_TOP + plotHeight * (1 - index / TICKS);

        return (
          <g key={index}>
            <line x1={PAD_LEFT} y1={y} x2={WIDTH - PAD_TOP} y2={y} stroke='currentColor' className='text-border' />
            <text
              x={PAD_LEFT - LABEL_GAP}
              y={y + LABEL_BASELINE}
              textAnchor='end'
              className='fill-muted-foreground font-mono text-[0.625rem]'
            >
              {formatRate(value)}
            </text>
          </g>
        );
      })}

      {samples.length > 1 && (
        <>
          <polyline
            points={toPoints(down, peak, samples.length)}
            fill='none'
            strokeWidth={2}
            strokeLinejoin='round'
            className='stroke-foreground'
          />
          <polyline
            points={toPoints(up, peak, samples.length)}
            fill='none'
            strokeWidth={2}
            strokeLinejoin='round'
            className='stroke-muted-foreground'
          />
        </>
      )}

      <text x={PAD_LEFT} y={HEIGHT - LABEL_BOTTOM} className='fill-muted-foreground font-mono text-[0.625rem]'>
        −60 с
      </text>
      <text
        x={WIDTH - PAD_TOP}
        y={HEIGHT - LABEL_BOTTOM}
        textAnchor='end'
        className='fill-muted-foreground font-mono text-[0.625rem]'
      >
        сейчас
      </text>
    </svg>
  );
}
