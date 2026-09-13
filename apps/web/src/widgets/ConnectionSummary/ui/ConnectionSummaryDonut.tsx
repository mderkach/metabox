import { toDonutSegments, toPercents } from '@shared/lib/chart';
import { cn } from '@shared/lib/utils';

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  /** Подпись под названием доли: байты, скорость, число соединений. */
  caption: string;
  /** Класс обводки сегмента. */
  tone: string;
}

/** Кольцо в долях области; радиус меньше половины на толщину обводки. */
const PLOT = 100;
const HALVES = 2;
const CENTER = PLOT / HALVES;
const RADIUS = 40;
const STROKE = 14;
const DIAMETER = RADIUS * HALVES;
const CIRCUMFERENCE = Math.PI * DIAMETER;
/** Дуга стартует справа, как на часах в три часа: доли читаются сверху. */
const START_TURN = -90;

export function ConnectionSummaryDonut({ slices, empty }: { slices: DonutSlice[]; empty: string }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  if (total === 0) {
    return <p className='text-xs text-muted-foreground'>{empty}</p>;
  }

  const values = slices.map((slice) => slice.value);
  const segments = toDonutSegments(values, CIRCUMFERENCE);
  const percents = toPercents(values);

  return (
    <div className='flex flex-wrap items-center gap-x-5 gap-y-3'>
      <svg
        viewBox={`0 0 ${String(PLOT)} ${String(PLOT)}`}
        role='img'
        aria-label={slices.map((slice) => `${slice.label}: ${slice.caption}`).join(', ')}
        className='size-20 shrink-0'
      >
        {slices.map((slice, index) => (
          <circle
            key={slice.key}
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill='none'
            strokeWidth={STROKE}
            strokeDasharray={segments[index].dash}
            transform={`rotate(${String(START_TURN + segments[index].turn)} ${String(CENTER)} ${String(CENTER)})`}
            className={cn('stroke-current', slice.tone)}
          />
        ))}
      </svg>

      <dl className='flex min-w-0 grow flex-col gap-2'>
        {slices.map((slice, index) => (
          <div key={slice.key} className='flex min-w-0 flex-col gap-0.5'>
            <dt className='flex items-center gap-1.5 text-xs'>
              <span className={cn('size-2 shrink-0 rounded-full bg-current', slice.tone)} aria-hidden='true' />
              <span className='min-w-0 truncate'>{slice.label}</span>
            </dt>
            <dd className='pl-3.5 font-mono text-xs text-muted-foreground tabular-nums'>
              {slice.caption} · {percents[index]}%
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
