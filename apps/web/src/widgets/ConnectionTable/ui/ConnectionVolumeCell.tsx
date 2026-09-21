import { formatBytes } from '@shared/lib/format';

import type { ConnectionCellProps } from './ConnectionColumns';

export function ConnectionVolumeCell({ connection }: ConnectionCellProps) {
  return (
    <span className='grid gap-y-0.5 font-mono text-xs text-muted-foreground tabular-nums'>
      <span>↓ {formatBytes(connection.download)}</span>
      <span>↑ {formatBytes(connection.upload)}</span>
    </span>
  );
}
