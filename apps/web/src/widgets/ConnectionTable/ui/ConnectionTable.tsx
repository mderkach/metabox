import { useTable, type ColumnVisibilityState, type SortingState } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { ConnectionRow as ConnectionRowModel } from '@entities/Connection';
import { useCloseConnection } from '@features/Connection/ConnectionClose';
import { useNarrowScreen } from '@shared/lib/media';

import { useNow } from '../lib';
import { ConnectionCard } from './ConnectionCard';
import { ConnectionColumnPicker } from './ConnectionColumnPicker';
import {
  CONNECTION_COLUMNS,
  CONNECTION_COLUMNS_HIDDEN,
  CONNECTION_TABLE_FEATURES,
  toTableColumns,
  toTableMinWidth,
} from './ConnectionColumns';
import { ConnectionRow } from './ConnectionRow';
import { ConnectionTableHeader } from './ConnectionTableHeader';

/** Оценки для первого кадра: точную высоту виртуализатор измеряет сам. */
const ROW_ESTIMATE = 48;
const CARD_ESTIMATE = 220;
const OVERSCAN = 10;

/** Строка заголовка тоже строка таблицы: нумерация строк начинается с неё. */
const HEADER_ROWS = 1;

/**
 * Список соединений: тулбар, шапка с сортировкой, виртуализованные строки и
 * подвал со счётчиком.
 *
 * Анатомия, виртуализация, политика сортировки и устройство прокрутки —
 * [гайд по таблицам](../../../../docs/guides/Tables.md). Здесь важно только
 * одно, что легко сломать правкой: скроллер один и на обе оси, а шапка внутри
 * него липкая. Вертикальный вьюпорт внутри горизонтального заводит собственную
 * горизонтальную прокрутку и уезжает из-под шапки.
 */
export function ConnectionTable({
  rows,
  total,
  closable,
  empty,
  search = null,
  actions = null,
  facets = null,
  footer = null,
  selectedId = null,
  onExplain = null,
}: {
  rows: ConnectionRowModel[];
  /** Сколько строк во вкладке до отбора: подвал сообщает обе величины. */
  total: number;
  closable: boolean;
  /** Что показать вместо таблицы, когда строк нет. */
  empty: ReactNode;
  /** Поиск: левый край тулбара. */
  search?: ReactNode;
  /** Действия над списком: живут в карточке таблицы, а не в шапке страницы. */
  actions?: ReactNode;
  /** Срезы по вопросу экрана: вторая строка тулбара. */
  facets?: ReactNode;
  /** Выгрузка: подвал, рядом со счётчиком — выгружается ровно то, что он называет. */
  footer?: ReactNode;
  selectedId?: string | null;
  /** `null` — объяснение маршрута выключено: у демона нет источника рантайма. */
  onExplain?: ((id: string) => void) | null;
}) {
  const { t } = useTranslation('widgets/ConnectionTable');
  const scrollRef = useRef<HTMLDivElement>(null);
  const close = useCloseConnection();
  const now = useNow();
  const narrow = useNarrowScreen();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>(CONNECTION_COLUMNS_HIDDEN);

  const onClose = useCallback(
    (id: string) => {
      close.mutate(id);
    },
    [close]
  );

  const table = useTable(
    {
      features: CONNECTION_TABLE_FEATURES,
      columns: CONNECTION_COLUMNS,
      data: rows,
      state: { sorting, columnVisibility },
      onSortingChange: setSorting,
      onColumnVisibilityChange: setColumnVisibility,
    },
    (state) => state
  );

  const sorted = table.getRowModel().rows;
  const columns = toTableColumns(table).filter(({ column }) => column.getIsVisible());
  // Ссылка обязана быть стабильной: `ConnectionRow` мемоизирована, и новый
  // массив на каждый снапшот обнулял бы мемоизацию всех отрисованных строк.
  const cells = useMemo(
    () =>
      CONNECTION_COLUMNS.filter((def) => columnVisibility[def.id] !== false).map((def) => ({
        id: def.id,
        className: def.meta.className,
        label: def.meta.label,
      })),
    [columnVisibility]
  );

  const virtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (narrow ? CARD_ESTIMATE : ROW_ESTIMATE),
    overscan: OVERSCAN,
  });

  return (
    <section className='flex min-h-0 grow flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10'>
      <div className='flex shrink-0 flex-col gap-2 border-b border-border px-3.5 py-2.5'>
        <div className='flex flex-wrap items-center gap-2'>
          {search}
          <span className='grow' />
          <ConnectionColumnPicker table={table} />
          {actions}
        </div>
        {facets}
      </div>

      {rows.length === 0 ? (
        <div className='flex grow items-center justify-center px-4 py-10 text-center'>{empty}</div>
      ) : (
        <div
          ref={scrollRef}
          data-virtual-viewport=''
          role={narrow ? 'list' : 'table'}
          aria-label={t('label')}
          aria-rowcount={narrow ? undefined : sorted.length + HEADER_ROWS}
          className='min-h-0 grow overflow-auto'
        >
          {/* Ширина задаётся здесь, а не на строке: одно значение держит шапку
              и строки вместе, и по нему же таблица сужается, когда колонки скрыты. */}
          <div style={narrow ? undefined : { minWidth: toTableMinWidth(columns) }}>
            {!narrow && <ConnectionTableHeader columns={columns} />}

            <div
              role={narrow ? undefined : 'rowgroup'}
              className='relative'
              style={{ height: `${String(virtualizer.getTotalSize())}px` }}
            >
              {virtualizer.getVirtualItems().map((item) => {
                const row = sorted[item.index].original;

                return (
                  <div
                    key={row.id}
                    ref={virtualizer.measureElement}
                    data-index={item.index}
                    className='absolute inset-x-0 top-0'
                    style={{ transform: `translateY(${String(item.start)}px)` }}
                  >
                    {narrow ? (
                      <ConnectionCard
                        connection={row}
                        cells={cells}
                        now={now}
                        onClose={closable ? onClose : null}
                        onExplain={onExplain}
                        selected={row.id === selectedId}
                      />
                    ) : (
                      <ConnectionRow
                        connection={row}
                        cells={cells}
                        rowIndex={item.index + 1 + HEADER_ROWS}
                        now={now}
                        onClose={closable ? onClose : null}
                        onExplain={onExplain}
                        selected={row.id === selectedId}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className='flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-border px-3.5 py-2 text-xs text-muted-foreground'>
        <p role='status'>
          {sorted.length === total
            ? t('footer.rows', { count: total })
            : t('footer.shown', { shown: sorted.length, total })}
        </p>
        <span className='grow' />
        {footer}
      </div>
    </section>
  );
}
