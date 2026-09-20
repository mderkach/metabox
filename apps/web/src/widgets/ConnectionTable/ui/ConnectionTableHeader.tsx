import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';
import { TABLE_HEADER } from '@shared/ui';

import { DENSITY_PADDING, type TableDensity } from '../lib';
import { ConnectionColumnFilter } from './ConnectionColumnFilter';
import { CONNECTION_COLUMN, type ConnectionTableColumn } from './ConnectionColumns';

const SORT_ICON = {
  asc: ArrowUp,
  desc: ArrowDown,
} as const;

/** Значения `aria-sort` фиксированы спецификацией. */
const ARIA_SORT = {
  asc: 'ascending',
  desc: 'descending',
} as const;

/**
 * Шапка таблицы.
 *
 * Липкая: скроллер один и на обе оси, поэтому шапка удерживается `sticky`, а не
 * живёт в отдельном контейнере — тот завёл бы собственную горизонтальную
 * прокрутку и уехал бы из-под строк.
 *
 * Стрелка сортировки показывается у отсортированной колонки и под курсором: у
 * всех сразу она превращается в шум и ничего не сообщает.
 */
export function ConnectionTableHeader({
  columns,
  density,
}: {
  columns: readonly ConnectionTableColumn[];
  density: TableDensity;
}) {
  const { t } = useTranslation('widgets/ConnectionTable');

  return (
    <div role='rowgroup' className='sticky top-0 z-10 bg-card'>
      <div
        role='row'
        aria-rowindex={1}
        className={cn(CONNECTION_COLUMN.Row, DENSITY_PADDING[density], TABLE_HEADER, 'bg-table-head')}
      >
        {columns.map(({ def, column }) => {
          const direction = column.getIsSorted();
          const Icon = direction === false ? ChevronsUpDown : SORT_ICON[direction];
          const filterable = column.getCanFilter();

          return (
            <span
              key={def.id}
              role='columnheader'
              aria-sort={direction === false ? 'none' : ARIA_SORT[direction]}
              className={cn(def.meta.className, filterable && 'flex min-w-0 items-center gap-0.5')}
            >
              <button
                type='button'
                onClick={column.getToggleSortingHandler()}
                className={cn(
                  'group/sort inline-flex max-w-full min-w-0 items-center gap-1 rounded-md px-1 py-0.5 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
                  direction !== false && 'text-foreground'
                )}
              >
                <span className='truncate'>{t(def.meta.label)}</span>
                <Icon
                  className={cn(
                    'size-3 shrink-0 transition-opacity',
                    direction === false && 'opacity-0 group-hover/sort:opacity-50 group-focus-visible/sort:opacity-50'
                  )}
                />
              </button>

              {filterable && <ConnectionColumnFilter def={def} column={column} />}
            </span>
          );
        })}

        <span role='columnheader' className={CONNECTION_COLUMN.RowActions}>
          <span className='sr-only'>{t('column.rowActions')}</span>
        </span>
      </div>
    </div>
  );
}
