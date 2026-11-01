import { toPercents, toShare } from '@shared/lib/chart';
import { cn } from '@shared/lib/utils';
import { Empty, EMPTY_INLINE, EmptyDescription, EmptyHeader } from '@shared/ui';

const PERCENT = 100;

export interface SplitSlice {
  key: string;
  label: string;
  value: number;
  /** Caption after the share name: bytes or connection count. */
  caption: string;
  /** Segment fill class. */
  tone: string;
}

/**
 * Parts of one whole as segments of a single bar. Two or three parts read
 * from one length faster than from ring arcs, and the bar keeps the row
 * height of the neighbouring summary panels.
 */
export function ConnectionSummarySplit({ slices, empty }: { slices: SplitSlice[]; empty: string }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  if (total === 0) {
    return (
      <Empty className={EMPTY_INLINE}>
        <EmptyHeader>
          <EmptyDescription>{empty}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const percents = toPercents(slices.map((slice) => slice.value));

  return (
    <div className='flex flex-col gap-3'>
      <span
        role='img'
        aria-label={slices.map((slice, index) => `${slice.label}: ${String(percents[index])}%`).join(', ')}
        className='flex h-2 gap-0.5 overflow-hidden rounded-full'
      >
        {slices.map(
          (slice) =>
            slice.value > 0 && (
              <span
                key={slice.key}
                className={cn('block h-full', slice.tone)}
                style={{ width: `${String(toShare(slice.value, total) * PERCENT)}%` }}
              />
            )
        )}
      </span>

      <dl className='flex flex-col gap-1.5'>
        {slices.map((slice, index) => (
          <div key={slice.key} className='grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3'>
            <dt className='flex min-w-0 items-center gap-1.5 text-xs'>
              <span aria-hidden='true' className={cn('size-2 shrink-0 rounded-full', slice.tone)} />
              <span className='min-w-0 truncate'>{slice.label}</span>
            </dt>
            <dd className='font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums'>
              {slice.caption} · {percents[index]}%
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
