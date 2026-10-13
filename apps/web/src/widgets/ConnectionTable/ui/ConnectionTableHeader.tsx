import { ArrowDown, ArrowUp, ChevronsUpDown, ListFilter } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';
import { TABLE_HEADER } from '@shared/ui';

import { DENSITY_PADDING, type TableDensity } from '../lib';
import { CONNECTION_COLUMN, type ConnectionField, type ConnectionTableColumn } from './ConnectionColumns';

const SORT_ICON = {
  asc: ArrowUp,
  desc: ArrowDown,
} as const;

/** `aria-sort` values are fixed by the specification. */
const ARIA_SORT = {
  asc: 'ascending',
  desc: 'descending',
} as const;

/**
 * Table header.
 *
 * Sticky: there is one scroller for both axes, so the header is held by `sticky` and does not
 * live in a separate container — that would create its own horizontal
 * scrolling and slide out from under the rows.
 *
 * The sort arrow is shown on the sorted column and under the cursor: on
 * all at once it becomes noise and conveys nothing.
 *
 * Filtering by a field is set by a facet in the toolbar, and the column header carries its mark:
 * without it an empty table looks broken, not like a filter result.
 */
export function ConnectionTableHeader({
  columns,
  density,
  filteredColumns,
}: {
  columns: readonly ConnectionTableColumn[];
  density: TableDensity;
  filteredColumns: ReadonlySet<ConnectionField>;
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
          const filtered = filteredColumns.has(def.id);

          return (
            <span
              key={def.id}
              role='columnheader'
              aria-sort={direction === false ? 'none' : ARIA_SORT[direction]}
              className={cn(def.meta.className, filtered && 'flex min-w-0 items-center gap-0.5')}
            >
              {/* Tailwind Preflight sets `text-transform: none` on buttons: without
                  inheritance the label loses the header small caps. */}
              <button
                type='button'
                onClick={column.getToggleSortingHandler()}
                className={cn(
                  'group/sort inline-flex max-w-full min-w-0 items-center gap-1 rounded-md px-1 py-0.5 [text-transform:inherit] transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
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

              {filtered && (
                <span className='inline-flex shrink-0 items-center text-foreground'>
                  <ListFilter aria-hidden className='size-3' />
                  <span className='sr-only'>{t('filter.marked')}</span>
                </span>
              )}
            </span>
          );
        })}

        <span role='columnheader' className={CONNECTION_COLUMN.RowActions}>
          <span className='sr-only'>{t('list.rowActions', { ns: 'shared' })}</span>
        </span>
      </div>
    </div>
  );
}
