import type { ConnectionCellProps } from './ConnectionColumns';

export function ConnectionChainCell({ connection }: ConnectionCellProps) {
  const chain = connection.chain.join(' → ');

  return (
    <span className='block truncate text-2xs text-muted-foreground' title={chain}>
      {chain}
    </span>
  );
}
