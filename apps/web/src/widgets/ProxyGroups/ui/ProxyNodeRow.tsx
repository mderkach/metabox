import { memo } from 'react';

import { DELAY_STATE, DELAY_TIMEOUT, type ProxyNode } from '@entities/Proxy';
import { cn } from '@shared/lib/utils';

const DELAY_CLASS: Readonly<Record<string, string>> = {
  [DELAY_STATE.Fast]: 'bg-emerald-400',
  [DELAY_STATE.Slow]: 'bg-amber-400',
  [DELAY_STATE.Failed]: 'bg-destructive',
  [DELAY_STATE.Unknown]: 'bg-muted-foreground/40',
};

function DelayValue({ node }: { node: ProxyNode }) {
  if (node.delay === null) {
    return <span className='text-xs text-muted-foreground'>не проверялся</span>;
  }

  // Отдельная подпись, а не «65535 мс»: это отказ соединиться, а не задержка.
  if (node.delay >= DELAY_TIMEOUT) {
    return <span className='text-xs text-destructive'>не ответил</span>;
  }

  return (
    <span className='font-mono text-xs tabular-nums'>
      <data value={node.delay}>{node.delay} мс</data>
    </span>
  );
}

function ProxyNodeRowProto({
  node,
  selectable,
  onSelect,
}: {
  node: ProxyNode;
  selectable: boolean;
  onSelect: (name: string) => void;
}) {
  const content = (
    <>
      <span className={cn('size-2 shrink-0 rounded-full', DELAY_CLASS[node.delayState])} aria-hidden='true' />
      <span className='min-w-0 grow truncate font-mono text-xs'>{node.name}</span>
      <span className='shrink-0 rounded-md border border-input px-1.5 py-0.5 text-[0.6875rem] text-muted-foreground'>
        {node.type}
      </span>
      <span className='w-24 shrink-0 text-right'>
        <DelayValue node={node} />
      </span>
    </>
  );

  const className = cn(
    'flex w-full items-center gap-3 border-t border-border px-4 py-2 text-left',
    node.selected && 'bg-muted/60'
  );

  return (
    <li className='first:[&>*]:border-t-0'>
      {selectable ? (
        <button
          type='button'
          className={cn(className, 'hover:bg-muted')}
          aria-pressed={node.selected}
          onClick={() => {
            onSelect(node.name);
          }}
        >
          {content}
        </button>
      ) : (
        <p className={className}>{content}</p>
      )}
    </li>
  );
}

export const ProxyNodeRow = memo(ProxyNodeRowProto);
