import { formatRate } from '@shared/lib/format';
import { cn } from '@shared/lib/utils';

import type { ConnectionCellProps } from './ConnectionColumns';

/** Нулевая скорость — не «0 Б/с», а прочерк: молчащих строк большинство. */
const IDLE_RATE = 1;

export function ConnectionRateCell({ connection }: ConnectionCellProps) {
  return (
    <span className='grid gap-y-0.5 font-mono text-xs'>
      <span
        className={cn('tabular-nums', connection.downRate >= IDLE_RATE ? 'text-series-down' : 'text-muted-foreground')}
      >
        ↓ {connection.downRate >= IDLE_RATE ? formatRate(connection.downRate) : '—'}
      </span>
      <span className={cn('tabular-nums', connection.upRate >= IDLE_RATE ? 'text-series-up' : 'text-muted-foreground')}>
        ↑ {connection.upRate >= IDLE_RATE ? formatRate(connection.upRate) : '—'}
      </span>
    </span>
  );
}
