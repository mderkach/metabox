import { cn } from '@shared/lib/utils';

import { toActionTone } from './ConnectionAction';
import type { ConnectionCellProps } from './ConnectionColumns';

export function ConnectionActionCell({ connection }: ConnectionCellProps) {
  return (
    <span
      className={cn('block truncate font-mono text-xs font-medium', toActionTone(connection.action))}
      title={connection.action}
    >
      {connection.action}
    </span>
  );
}
