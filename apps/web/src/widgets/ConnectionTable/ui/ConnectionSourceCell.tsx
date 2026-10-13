import { deviceLabel, useDeviceIndex } from '@entities/Device';
import { cn } from '@shared/lib/utils';

import type { ConnectionCellProps } from './ConnectionColumns';

/** Device label instead of an address; the address stays in the tooltip — it is used to cross-check router logs. */
export function ConnectionSourceCell({ connection }: ConnectionCellProps) {
  const devices = useDeviceIndex();
  const label = deviceLabel(connection.source, devices);

  return (
    <span
      className={cn('block truncate text-xs text-muted-foreground', label === connection.source && 'font-mono')}
      title={connection.source}
    >
      {label}
    </span>
  );
}
