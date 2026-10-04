import { useTable, type ColumnFiltersState } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { ConnectionRow as ConnectionRowModel } from '@entities/Connection';
import { useCloseConnection } from '@features/Connection/ConnectionClose';
import { useNarrowScreen } from '@shared/lib/media';
import { cn } from '@shared/lib/utils';
import { SURFACE } from '@shared/ui';

import { DENSITY_ROW_ESTIMATE, useNow, type ConnectionView } from '../lib';
import { ConnectionCard } from './ConnectionCard';
import { ConnectionColumnPicker } from './ConnectionColumnPicker';
import { CONNECTION_COLUMNS, CONNECTION_TABLE_FEATURES, toTableColumns, toTableMinWidth } from './ConnectionColumns';
import { ConnectionDensityToggle } from './ConnectionDensityToggle';
import { ConnectionRefreshSelect } from './ConnectionRefreshSelect';
import { ConnectionRow } from './ConnectionRow';
import { ConnectionTableHeader } from './ConnectionTableHeader';

/** Оценка карточки узкого экрана для первого кадра: точную высоту виртуализатор измеряет сам. */
const CARD_ESTIMATE = 108;
const OVERSCAN = 10;

/** Строка заголовка тоже строка таблицы: нумерация строк начинается с неё. */
const HEADER_ROWS = 1;

/** Что показать вместо таблицы, когда после всех отборов не осталось строк. */
export interface ConnectionTableEmpty {
  /** Отбор действует: поиск и фасеты экрана или фильтры колонок самой таблицы. */
  filtered: boolean;
  /** Снимает и то, и другое: кнопка на пустом экране обязана вернуть список. */
  reset: () => void;
}

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
  filtered,
  onReset,
  view,
  search = null,
  actions = null,
  facets = null,
  footer = null,
  overflow = null,
  selectedId = null,
  explainPanelId,
  onExplain = null,
}: {
  rows: ConnectionRowModel[];
  /** Сколько строк во вкладке до отбора: подвал сообщает обе величины. */
  total: number;
  closable: boolean;
  /**
   * Что показать вместо таблицы, когда строк нет. Признак отбора и его сброс
   * считает таблица: фильтры колонок живут в ней и экрану не видны.
   */
  empty: (state: ConnectionTableEmpty) => ReactNode;
  /** Отбор экрана: поиск и фасеты. Свои фильтры таблица добавляет к нему сама. */
  filtered: boolean;
  /** Снять отбор экрана; фильтры колонок таблица снимает сама. */
  onReset: () => void;
  /** Вид списка: он переживает перезагрузку, поэтому живёт снаружи таблицы. */
  view: ConnectionView;
  /** Поиск: левый край тулбара. */
  search?: ReactNode;
  /** Действия над списком: живут в карточке таблицы, а не в шапке страницы. */
  actions?: ReactNode;
  /** Срезы по вопросу экрана: вторая строка тулбара, на телефоне — первая. */
  facets?: ReactNode;
  /**
   * Выгрузка: подвал, рядом со счётчиком. Получает строки после всех отборов,
   * включая фильтры колонок, которых экран не видит, — уходит ровно то, что
   * счётчик называет.
   */
  footer?: ((rows: ConnectionRowModel[]) => ReactNode) | null;
  /** Переполнение источника: строки, которых в списке уже нет. Стоит рядом со счётчиком. */
  overflow?: ReactNode;
  selectedId?: string | null;
  /** Идентификатор панели объяснения: строка ссылается на неё `aria-controls`. */
  explainPanelId?: string;
  /** `null` — объяснение маршрута выключено: у демона нет источника рантайма. */
  onExplain?: ((id: string) => void) | null;
}) {
  const { t } = useTranslation('widgets/ConnectionTable');
  const scrollRef = useRef<HTMLDivElement>(null);
  const close = useCloseConnection();
  const now = useNow();
  const narrow = useNarrowScreen();
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const onClose = useCallback(
    (id: string) => {
      close.mutate(id);
    },
    [close]
  );

  const onResetAll = useCallback(() => {
    setColumnFilters([]);
    onReset();
  }, [onReset]);

  const table = useTable(
    {
      features: CONNECTION_TABLE_FEATURES,
      columns: CONNECTION_COLUMNS,
      data: rows,
      state: { sorting: view.sorting, columnVisibility: view.columns, columnFilters },
      onSortingChange: view.setSorting,
      onColumnVisibilityChange: view.setColumns,
      onColumnFiltersChange: setColumnFilters,
    },
    (state) => state
  );

  // Модель уже прошла и фильтры колонок, и сортировку: подвал считает по ней, и
  // «пусто из-за отбора» показывается в том числе от одного фильтра колонки.
  const visible = table.getRowModel().rows;
  const shownRows = useMemo(() => visible.map((row) => row.original), [visible]);
  const columns = toTableColumns(table).filter(({ column }) => column.getIsVisible());
  // Ссылка обязана быть стабильной: `ConnectionRow` мемоизирована, и новый
  // массив на каждый снапшот обнулял бы мемоизацию всех отрисованных строк.
  const cells = useMemo(
    () =>
      CONNECTION_COLUMNS.filter((def) => view.columns[def.id] !== false).map((def) => ({
        id: def.id,
        className: def.meta.className,
        label: def.meta.label,
      })),
    [view.columns]
  );

  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (narrow ? CARD_ESTIMATE : DENSITY_ROW_ESTIMATE[view.density]),
    overscan: OVERSCAN,
  });

  return (
    <section className={cn('flex min-h-0 grow flex-col overflow-hidden max-lg:min-h-96', SURFACE)}>
      <div className='flex shrink-0 flex-col gap-2 border-b border-border px-3.5 py-2.5'>
        <div className='flex flex-wrap items-center gap-2'>
          {search}
          <span className='grow' />
          {narrow && facets}
          <ConnectionColumnPicker table={table} />
          <ConnectionDensityToggle density={view.density} onDensityChange={view.setDensity} />
          <ConnectionRefreshSelect interval={view.interval} onIntervalChange={view.setInterval} />
          {actions}
        </div>
        {!narrow && facets}
      </div>

      {visible.length === 0 ? (
        <div className='flex grow items-center justify-center px-4 py-10 text-center'>
          {empty({ filtered: filtered || columnFilters.length > 0, reset: onResetAll })}
        </div>
      ) : (
        <div
          ref={scrollRef}
          data-virtual-viewport=''
          role={narrow ? 'list' : 'table'}
          aria-label={t('section.connections', { ns: 'shared' })}
          aria-rowcount={narrow ? undefined : visible.length + HEADER_ROWS}
          className='min-h-0 grow overflow-auto'
        >
          <div style={narrow ? undefined : { minWidth: toTableMinWidth(columns) }}>
            {!narrow && <ConnectionTableHeader columns={columns} density={view.density} />}

            <div
              role={narrow ? undefined : 'rowgroup'}
              className='relative'
              style={{ height: `${String(virtualizer.getTotalSize())}px` }}
            >
              {virtualizer.getVirtualItems().map((item) => {
                const row = visible[item.index].original;

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
                        panelId={explainPanelId}
                      />
                    ) : (
                      <ConnectionRow
                        connection={row}
                        cells={cells}
                        density={view.density}
                        rowIndex={item.index + 1 + HEADER_ROWS}
                        now={now}
                        onClose={closable ? onClose : null}
                        onExplain={onExplain}
                        selected={row.id === selectedId}
                        panelId={explainPanelId}
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
          {visible.length === total
            ? t('count.connection', { ns: 'shared', count: total })
            : t('list.shown', { ns: 'shared', shown: visible.length, total })}
        </p>
        {overflow}
        <span className='grow' />
        {footer !== null && footer(shownRows)}
      </div>
    </section>
  );
}
