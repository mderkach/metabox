import { formatAge } from '@shared/lib/format';
import { MS_IN_SECOND } from '@shared/lib/time';

import type { ConnectionCellProps } from './ConnectionColumns';

export function ConnectionAgeCell({ connection, now }: ConnectionCellProps) {
  return (
    <time
      dateTime={new Date(connection.startedAt).toISOString()}
      className='font-mono text-xs text-muted-foreground tabular-nums'
    >
      {formatAge((now - connection.startedAt) / MS_IN_SECOND)}
    </time>
  );
}
