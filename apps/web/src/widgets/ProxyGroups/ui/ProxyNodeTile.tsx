import { Check } from 'lucide-react';
import { memo } from 'react';

import { DELAY_STATE, DELAY_TIMEOUT, type ProxyNode } from '@entities/Proxy';
import { cn } from '@shared/lib/utils';

const DELAY_TONE: Readonly<Record<string, string>> = {
  [DELAY_STATE.Fast]: 'text-signal-ok',
  [DELAY_STATE.Slow]: 'text-signal-warn',
  [DELAY_STATE.Failed]: 'text-signal-bad',
  [DELAY_STATE.Unknown]: 'text-muted-foreground',
};

function DelayValue({ node }: { node: ProxyNode }) {
  if (node.delay === null) {
    return <span className='text-2xs text-muted-foreground'>не проверялся</span>;
  }

  // Отдельная подпись, а не «65535 мс»: это отказ соединиться, а не задержка.
  if (node.delay >= DELAY_TIMEOUT) {
    return <span className='text-2xs font-medium text-signal-bad'>не ответил</span>;
  }

  return (
    <span className={cn('font-mono text-2xs font-medium tabular-nums', DELAY_TONE[node.delayState])}>
      <data value={node.delay}>{node.delay} мс</data>
    </span>
  );
}

/** Выбранный узел несёт кромку и галочку: два признака, один не цветовой (ADR-0013). */
function ProxyNodeTileProto({
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
      <span className='flex min-w-0 items-center gap-1.5'>
        {node.selected && <Check className='size-3.5 shrink-0 text-primary' aria-hidden='true' />}
        <span className='min-w-0 grow truncate font-mono text-xs'>{node.name}</span>
      </span>
      <span className='flex items-center justify-between gap-2'>
        <span className='truncate text-2xs text-muted-foreground'>{node.type}</span>
        <DelayValue node={node} />
      </span>
    </>
  );

  const className = cn(
    'flex w-full flex-col gap-1.5 rounded-md border px-2.5 py-2 text-left transition-colors',
    node.selected ? 'border-selected-edge bg-selected' : 'border-border bg-card'
  );

  return (
    <li>
      {selectable ? (
        <button
          type='button'
          className={cn(
            className,
            'hover:border-selected-edge/60 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none'
          )}
          aria-pressed={node.selected}
          onClick={() => {
            onSelect(node.name);
          }}
        >
          {content}
        </button>
      ) : (
        <p className={className}>
          {node.selected && <span className='sr-only'>выбран сейчас</span>}
          {content}
        </p>
      )}
    </li>
  );
}

export const ProxyNodeTile = memo(ProxyNodeTileProto);
