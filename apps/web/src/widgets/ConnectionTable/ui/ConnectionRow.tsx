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
}: {
  connection: ConnectionRowModel;
  rowIndex: number;
  onClose: ((id: string) => void) | null;
}) {
  return (
    <div role='row' aria-rowindex={rowIndex} className={cn(CONNECTION_COLUMN.Row, 'hover:bg-muted/50')}>
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

      <span role='cell' className={cn(CONNECTION_COLUMN.Rule, 'flex flex-col')}>
        <span className='truncate font-mono text-xs'>
          {connection.rule.length > 0 ? connection.rule : 'без условий'}
        </span>
        <span className='truncate text-xs text-muted-foreground'>{connection.outcome}</span>
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

export const ConnectionRow = memo(ConnectionRowProto);
