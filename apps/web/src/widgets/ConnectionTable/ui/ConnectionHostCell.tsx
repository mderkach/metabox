import type { ConnectionCellProps } from './ConnectionColumns';

export function ConnectionHostCell({ connection }: ConnectionCellProps) {
  return (
    <span className='block truncate font-mono text-xs' title={connection.host}>
      {connection.host}
    </span>
  );
}
