import { memo } from 'react';

import type { ConnectionRow as ConnectionRowModel } from '@entities/Connection';
import { cn } from '@shared/lib/utils';

import { DENSITY_PADDING, type TableDensity } from '../lib';
import { CELL } from './ConnectionCells';
import { CONNECTION_COLUMN, type ConnectionCell } from './ConnectionColumns';
import { ConnectionRowActions } from './ConnectionRowActions';

function ConnectionRowProto({
  connection,
  cells,
  density,
  rowIndex,
  now,
  onClose,
  onExplain,
  selected,
  panelId,
}: {
  connection: ConnectionRowModel;
  /** Visible columns in table order: the row must match the header. */
  cells: readonly ConnectionCell[];
  density: TableDensity;
  rowIndex: number;
  now: number;
  onClose: ((id: string, host: string) => void) | null;
  /** `null` means route explanation is unavailable: the daemon did not provide the endpoint. */
  onExplain: ((id: string) => void) | null;
  selected: boolean;
  panelId?: string;
}) {
  return (
    <div
      role='row'
      aria-rowindex={rowIndex}
      className={cn(
        CONNECTION_COLUMN.Row,
        DENSITY_PADDING[density],
        'relative bg-card hover:bg-row-hover',
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

      <span role='cell' className={cn(CONNECTION_COLUMN.RowActions, 'flex items-center gap-2')}>
        <ConnectionRowActions
          connection={connection}
          onClose={onClose}
          onExplain={onExplain}
          selected={selected}
          panelId={panelId}
        />
      </span>
    </div>
  );
}

export const ConnectionRow = memo(ConnectionRowProto);
