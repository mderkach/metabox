import type { ConnectionCellProps } from './ConnectionColumns';

/**
 * The chain ends with the node the traffic left through, and that is what the column is read for:
 * the start is truncated first, the last node keeps its place.
 */
export function ConnectionChainCell({ connection }: ConnectionCellProps) {
  const chain = connection.chain.join(' → ');
  const head = connection.chain.slice(0, -1);
  const last = connection.chain.at(-1) ?? '';

  return (
    <span className='flex min-w-0 text-xs text-muted-foreground' title={chain}>
      {head.length > 0 && <span className='min-w-0 truncate'>{head.join(' → ')}</span>}
      {head.length > 0 && <span className='shrink-0 whitespace-pre'> → </span>}
      <span className='max-w-full min-w-0 shrink-0 truncate'>{last}</span>
    </span>
  );
}
