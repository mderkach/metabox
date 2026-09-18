import type { ConnectionCellProps } from './ConnectionColumns';

export function ConnectionNetworkCell({ connection }: ConnectionCellProps) {
  return <span className='font-mono text-2xs text-muted-foreground'>{connection.network}</span>;
}
