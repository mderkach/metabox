import { X } from 'lucide-react';
import { memo } from 'react';

import type { ConnectionRow as ConnectionRowModel } from '@entities/Connection';
import { formatAge, formatBytes, formatRate } from '@shared/lib/format';
import { MS_IN_SECOND } from '@shared/lib/time';
import { cn } from '@shared/lib/utils';

import { CONNECTION_COLUMN } from './ConnectionColumns';
import { toOutcomeTone } from './ConnectionOutcome';

/** Нулевая скорость — не «0 Б/с», а прочерк: молчащих строк большинство. */
const IDLE_RATE = 1;

function ConnectionRowProto({
  connection,
  rowIndex,
  now,
  onClose,
  onExplain,
  selected,
}: {
  connection: ConnectionRowModel;
  rowIndex: number;
  /** Момент отсчёта возраста. Снаружи, иначе строка врала бы про свежесть. */
  now: number;
  onClose: ((id: string) => void) | null;
  /** `null` — объяснение маршрута недоступно: демон не отдал ручку. */
  onExplain: ((id: string) => void) | null;
  selected: boolean;
}) {
  const chain = connection.chain.join(' → ');

  return (
    <div
      role='row'
      aria-rowindex={rowIndex}
      className={cn(
        CONNECTION_COLUMN.Row,
        'relative hover:bg-muted/40',
        selected && 'bg-selected before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-selected-edge'
      )}
    >
      <span role='cell' className={cn(CONNECTION_COLUMN.Host, 'flex flex-col')}>
        <span className='truncate font-mono text-xs' title={connection.host}>
          {connection.host}
        </span>
        <span className='truncate text-2xs text-muted-foreground'>
          {connection.source} · {connection.network}
        </span>
      </span>

      <span role='cell' className={CONNECTION_COLUMN.Route}>
        {onExplain === null ? (
          <RouteCell connection={connection} chain={chain} />
        ) : (
          <button
            type='button'
            aria-pressed={selected}
            aria-label={`Почему соединение ${connection.host} пошло этим маршрутом`}
            className='flex w-full min-w-0 flex-col rounded-md px-1 py-0.5 text-left hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none'
            onClick={() => {
              onExplain(connection.id);
            }}
          >
            <RouteCell connection={connection} chain={chain} />
          </button>
        )}
      </span>

      <span role='cell' className={cn(CONNECTION_COLUMN.Traffic, 'grid grid-cols-2 gap-x-2 font-mono text-2xs')}>
        <span
          className={cn(
            'tabular-nums',
            connection.downRate >= IDLE_RATE ? 'text-series-down' : 'text-muted-foreground'
          )}
        >
          ↓ {connection.downRate >= IDLE_RATE ? formatRate(connection.downRate) : '—'}
        </span>
        <span className='text-muted-foreground tabular-nums'>{formatBytes(connection.download)}</span>
        <span
          className={cn('tabular-nums', connection.upRate >= IDLE_RATE ? 'text-series-up' : 'text-muted-foreground')}
        >
          ↑ {connection.upRate >= IDLE_RATE ? formatRate(connection.upRate) : '—'}
        </span>
        <span className='text-muted-foreground tabular-nums'>{formatBytes(connection.upload)}</span>
      </span>

      <span role='cell' className={cn(CONNECTION_COLUMN.Age, 'font-mono text-2xs text-muted-foreground tabular-nums')}>
        <time dateTime={new Date(connection.startedAt).toISOString()}>
          {formatAge((now - connection.startedAt) / MS_IN_SECOND)}
        </time>
      </span>

      <span role='cell' className={CONNECTION_COLUMN.Close}>
        {onClose !== null && (
          <button
            type='button'
            aria-label={`Закрыть соединение ${connection.host}`}
            className='flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none'
            onClick={() => {
              onClose(connection.id);
            }}
          >
            <X className='size-3.5' />
          </button>
        )}
      </span>
    </div>
  );
}

/** Правило и цепочка одной колонкой: раздельным колонкам цепочки не хватало ширины. */
function RouteCell({ connection, chain }: { connection: ConnectionRowModel; chain: string }) {
  return (
    <>
      <span className='flex w-full min-w-0 items-baseline gap-1.5 font-mono text-xs'>
        <span className='truncate'>{connection.rule.length > 0 ? connection.rule : 'без условий'}</span>
        <span aria-hidden='true' className='shrink-0 text-muted-foreground'>
          →
        </span>
        <span className={cn('shrink-0 font-medium', toOutcomeTone(connection.outcome))}>{connection.outcome}</span>
      </span>
      <span className='w-full truncate text-2xs text-muted-foreground' title={chain}>
        {chain}
      </span>
    </>
  );
}

export const ConnectionRow = memo(ConnectionRowProto);
