import type { ConnectionCellProps } from './ConnectionColumns';

export function ConnectionSourceCell({ connection }: ConnectionCellProps) {
  return (
    <span className='block truncate font-mono text-xs text-muted-foreground' title={connection.source}>
      {connection.source}
    </span>
  );
}
