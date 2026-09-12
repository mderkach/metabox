import { X } from 'lucide-react';
import { memo } from 'react';

import type { ConnectionRow as ConnectionRowModel } from '@entities/Connection';
import { formatBytes } from '@shared/lib/format';
import { cn } from '@shared/lib/utils';

import { CONNECTION_COLUMN } from './ConnectionColumns';

function ConnectionRowProto({
  connection,
  rowIndex,
  onClose,
  onExplain,
  selected,
}: {
  connection: ConnectionRowModel;
  rowIndex: number;
  onClose: ((id: string) => void) | null;
  /** `null` — объяснение маршрута недоступно: демон не отдал ручку. */
  onExplain: ((id: string) => void) | null;
  selected: boolean;
}) {
  return (
    <div
      role='row'
      aria-rowindex={rowIndex}
      className={cn(CONNECTION_COLUMN.Row, 'hover:bg-muted/50', selected && 'bg-muted')}
    >
      <span role='cell' className={CONNECTION_COLUMN.Close}>
        {onClose !== null && (
          <button
            type='button'
            aria-label={`Закрыть соединение ${connection.host}`}
            className='flex size-6 items-center justify-center rounded-md border border-input text-muted-foreground hover:bg-muted hover:text-foreground'
            onClick={() => {
              onClose(connection.id);
            }}
          >
            <X className='size-3.5' />
          </button>
        )}
      </span>

      <span role='cell' className={cn(CONNECTION_COLUMN.Host, 'flex flex-col')}>
        <span className='truncate font-mono text-xs'>{connection.host}</span>
        <span className='truncate text-xs text-muted-foreground'>
          {connection.source} · {connection.network}
        </span>
      </span>

      <span role='cell' className={CONNECTION_COLUMN.Rule}>
        {onExplain === null ? (
          <RuleCell connection={connection} />
        ) : (
          <button
            type='button'
            aria-pressed={selected}
            aria-label={`Почему соединение ${connection.host} пошло этим маршрутом`}
            className='flex w-full min-w-0 flex-col rounded-md px-1 py-0.5 text-left hover:bg-muted'
            onClick={() => {
              onExplain(connection.id);
            }}
          >
            <RuleCell connection={connection} />
          </button>
        )}
      </span>

      <span role='cell' className={cn(CONNECTION_COLUMN.Chain, 'truncate font-mono text-xs text-muted-foreground')}>
        {connection.chain.join(' → ')}
      </span>

      <span role='cell' className={cn(CONNECTION_COLUMN.Traffic, 'flex flex-col font-mono text-xs tabular-nums')}>
        <span>↓ {formatBytes(connection.download)}</span>
        <span className='text-muted-foreground'>↑ {formatBytes(connection.upload)}</span>
      </span>
    </div>
  );
}

/** Условия и исход одной строкой: в кнопке и без неё показываются одинаково. */
function RuleCell({ connection }: { connection: ConnectionRowModel }) {
  return (
    <>
      <span className='truncate font-mono text-xs'>{connection.rule.length > 0 ? connection.rule : 'без условий'}</span>
      <span className='truncate text-xs text-muted-foreground'>{connection.outcome}</span>
    </>
  );
}

export const ConnectionRow = memo(ConnectionRowProto);
