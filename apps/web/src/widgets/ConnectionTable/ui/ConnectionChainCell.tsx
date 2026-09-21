import type { ConnectionCellProps } from './ConnectionColumns';

export function ConnectionChainCell({ connection }: ConnectionCellProps) {
  const chain = connection.chain.join(' → ');

  return (
    <span className='block truncate text-xs text-muted-foreground' title={chain}>
      {chain}
    </span>
  );
}
