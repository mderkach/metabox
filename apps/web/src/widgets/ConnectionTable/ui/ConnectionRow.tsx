import { memo } from 'react';

import type { ConnectionRow as ConnectionRowModel } from '@entities/Connection';
import { cn } from '@shared/lib/utils';

import { CELL } from './ConnectionCells';
import { CONNECTION_COLUMN, type ConnectionCell } from './ConnectionColumns';
import { ConnectionRowActions } from './ConnectionRowActions';

function ConnectionRowProto({
  connection,
  cells,
  rowIndex,
  now,
  onClose,
  onExplain,
  selected,
}: {
  connection: ConnectionRowModel;
  /** Видимые колонки в порядке таблицы: строка обязана совпасть с шапкой. */
  cells: readonly ConnectionCell[];
  rowIndex: number;
  now: number;
  onClose: ((id: string) => void) | null;
  /** `null` — объяснение маршрута недоступно: демон не отдал ручку. */
  onExplain: ((id: string) => void) | null;
  selected: boolean;
}) {
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
      {cells.map(({ id, className }) => {
        const Cell = CELL[id];

        return (
          <span key={id} role='cell' className={className}>
            <Cell connection={connection} now={now} />
          </span>
        );
      })}

      <span role='cell' className={cn(CONNECTION_COLUMN.RowActions, 'flex items-center gap-1')}>
        <ConnectionRowActions connection={connection} onClose={onClose} onExplain={onExplain} selected={selected} />
      </span>
    </div>
  );
}

export const ConnectionRow = memo(ConnectionRowProto);
