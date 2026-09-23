import type { ValueScale } from '../lib/chart';
import { cn } from '../lib/utils';

const PERCENT = 100;

/** Крайние подписи прижаты внутрь: по центру деления они вылезли бы за край карточки. */
function edgeClass(index: number, last: number): string {
  if (index === 0) {
    return 'translate-x-0';
  }

  return index === last ? '-translate-x-full' : '-translate-x-1/2';
}

/**
 * Ось значений под полосами. Подписи — оформление: каждая строка над осью
 * печатает свою величину словами, и скринридеру ось ничего не добавляет.
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
