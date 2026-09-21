import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { ConnectionRow as ConnectionRowModel } from '@entities/Connection';
import { cn } from '@shared/lib/utils';

import { CELL } from './ConnectionCells';
import type { ConnectionCell } from './ConnectionColumns';
import { ConnectionRowActions } from './ConnectionRowActions';

/**
 * Соединение списком «подпись — значение».
 *
 * Раскладка узкого экрана: в таблице на телефоне видно середину строк, и к
 * какому соединению они относятся, определить нечем. Здесь каждое поле названо,
 * и ни одно из видимых не теряется — набор колонок тот же, что в таблице.
 *
 * Значения рисуют те же ячейки, что и таблица: расхождение форматирования между
 * раскладками читалось бы как расхождение данных.
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
  /** Момент отсчёта времени. Снаружи, иначе карточка врала бы про свежесть. */
  now: number;
  onClose: ((id: string) => void) | null;
  onExplain: ((id: string) => void) | null;
  selected: boolean;
  panelId?: string;
}) {
  const { t } = useTranslation('widgets/ConnectionTable');

  return (
    <div
      role='listitem'
      className={cn(
        'relative flex flex-col gap-2 border-b border-border px-4 py-3',
        selected && 'bg-selected before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-selected-edge'
      )}
    >
      <dl className='flex min-w-0 flex-col gap-1.5 text-sm'>
        {cells.map(({ id, label }) => {
          const Cell = CELL[id];

          return (
            <div key={id} className='flex min-w-0 items-baseline justify-between gap-3'>
              <dt className='shrink-0 text-xs tracking-[0.06em] text-muted-foreground uppercase'>{t(label)}</dt>
              <dd className='flex min-w-0 justify-end text-right'>
                <Cell connection={connection} now={now} />
              </dd>
            </div>
          );
        })}
      </dl>

      <div className='flex items-center justify-end gap-1'>
        <ConnectionRowActions
          connection={connection}
          onClose={onClose}
          onExplain={onExplain}
          selected={selected}
          panelId={panelId}
        />
      </div>
    </div>
  );
}

export const ConnectionCard = memo(ConnectionCardProto);
