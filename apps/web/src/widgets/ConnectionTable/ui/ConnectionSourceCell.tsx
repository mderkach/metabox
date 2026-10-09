import { deviceLabel, useDeviceIndex } from '@entities/Device';
import { cn } from '@shared/lib/utils';

import type { ConnectionCellProps } from './ConnectionColumns';

/** Подпись устройства вместо адреса; адрес остаётся в подсказке — по нему сверяют с журналами роутера. */
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
