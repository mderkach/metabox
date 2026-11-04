import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { ConnectionRow as ConnectionRowModel } from '@entities/Connection';
import { cn } from '@shared/lib/utils';

import { toCardLines } from '../lib/ConnectionTable.card';
import { CELL } from './ConnectionCells';
import { type ConnectionCell } from './ConnectionColumns';
import { ConnectionRowActions } from './ConnectionRowActions';

/**
 * A connection as a narrow-screen card.
 *
 * In a phone table the middle of the rows is visible, and there is no way to tell which connection they
 * belong to. The card is named by the destination host — a connection is
 * recognized by it — and the host is drawn as a header, not a list row: the column
 * is required and cannot be hidden. Volume and speed stand in a column to the right of the
 * rows, not in a row under them: their cells are two-story (↓ above ↑), and as a separate
 * row they would add two to the card. Field labels are seen only by a screen reader:
 * on a narrow screen height is dearer, and values are recognized by look.
 *
 * Values are drawn by the same cells as the table: a formatting mismatch between
 * layouts would read as a data mismatch.
 */
function ConnectionCardProto({
  connection,
  cells,
  now,
  onClose,
  onExplain,
  selected,
  panelId,
}: {
  connection: ConnectionRowModel;
  cells: readonly ConnectionCell[];
  /** Time reference moment. Passed in from outside, otherwise the card would lie about freshness. */
  now: number;
  onClose: ((id: string, host: string) => void) | null;
  onExplain: ((id: string) => void) | null;
  selected: boolean;
  panelId?: string;
}) {
  const { t } = useTranslation('widgets/ConnectionTable');
  const { lines, traffic } = useMemo(() => toCardLines(cells), [cells]);

  return (
    <div
      role='listitem'
      className={cn(
        'relative flex flex-col gap-1.5 border-b border-border px-4 py-2.5',
        selected && 'bg-selected before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-selected-edge'
      )}
    >
      <div className='flex min-w-0 items-center gap-2'>
        <dl className='min-w-0 grow'>
          <div>
            <dt className='sr-only'>{t('column.host')}</dt>
            <dd className='truncate font-mono text-sm font-medium' title={connection.host}>
              {connection.host}
            </dd>
          </div>
        </dl>
        <div className='flex shrink-0 items-center gap-2'>
          <ConnectionRowActions
            connection={connection}
            onClose={onClose}
            onExplain={onExplain}
            selected={selected}
            panelId={panelId}
          />
        </div>
      </div>

      <div className='flex min-w-0 gap-3'>
        <div className='flex min-w-0 grow flex-col gap-1'>
          {lines.map(({ place, separator, cells: lineCells }) => (
            <dl key={place} className='flex min-w-0 items-baseline gap-1.5'>
              {lineCells.map(({ id, label }, index) => {
                const Cell = CELL[id];

                return (
                  <div key={id} className='flex min-w-0 items-baseline'>
                    <dt className='sr-only'>{t(label)}</dt>
                    <dd className='flex min-w-0 items-baseline gap-1.5'>
                      {index > 0 && (
                        <span aria-hidden className='text-xs text-muted-foreground'>
                          {separator}
                        </span>
                      )}
                      <Cell connection={connection} now={now} />
                    </dd>
                  </div>
                );
              })}
            </dl>
          ))}
        </div>

        {traffic.length > 0 && (
          <dl className='flex shrink-0 gap-3 text-right'>
            {traffic.map(({ id, label }) => {
              const Cell = CELL[id];

              return (
                <div key={id}>
                  <dt className='sr-only'>{t(label)}</dt>
                  <dd>
                    <Cell connection={connection} now={now} />
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
      </div>
    </div>
  );
}

export const ConnectionCard = memo(ConnectionCardProto);
