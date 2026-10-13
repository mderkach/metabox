import type { ValueScale } from '../lib/chart';
import { cn } from '../lib/utils';

const PERCENT = 100;

/** Edge labels are pressed inward: centered on the tick they would stick out past the card edge. */
function edgeClass(index: number, last: number): string {
  if (index === 0) {
    return 'translate-x-0';
  }

  return index === last ? '-translate-x-full' : '-translate-x-1/2';
}

/**
 * Value axis under the bars. Labels are decoration: each row above the axis
 * prints its own quantity in words, and the axis adds nothing for a screen reader.
 */
export function ValueAxis({ scale, format }: { scale: ValueScale; format: (value: number) => string }) {
  const last = scale.ticks.length - 1;

  return (
    <div
      aria-hidden='true'
      className='relative h-5 border-t border-border font-mono text-xs text-muted-foreground tabular-nums'
    >
      {scale.ticks.map((tick, index) => (
        <span
          key={tick}
          className={cn('absolute top-1 whitespace-nowrap', edgeClass(index, last))}
          style={{ left: `${String((tick / scale.ceiling) * PERCENT)}%` }}
        >
          {format(tick)}
        </span>
      ))}
    </div>
  );
}
