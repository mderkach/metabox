import { useTable } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { memo, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { ConnectionRow as ConnectionRowModel } from '@entities/Connection';
import { deviceLabel, useDeviceIndex } from '@entities/Device';
import { useCloseConnection } from '@features/Connection/ConnectionClose';
import { useNarrowScreen } from '@shared/lib/media';
import { cn } from '@shared/lib/utils';
import { SURFACE } from '@shared/ui';

import { DENSITY_ROW_ESTIMATE, useNow, type ConnectionView } from '../lib';
import { ConnectionCard } from './ConnectionCard';
import { ConnectionColumnPicker } from './ConnectionColumnPicker';
import {
  CONNECTION_TABLE_FEATURES,
  toLabeledColumns,
  toOrderedColumns,
  toTableColumns,
  toTableMinWidth,
  type ConnectionField,
} from './ConnectionColumns';
import { ConnectionDensityToggle } from './ConnectionDensityToggle';
import { ConnectionRefreshSelect } from './ConnectionRefreshSelect';
import { ConnectionRow } from './ConnectionRow';
import { ConnectionTableHeader } from './ConnectionTableHeader';

/** Оценка карточки узкого экрана для первого кадра: точную высоту виртуализатор измеряет сам. */
const CARD_ESTIMATE = 108;
const OVERSCAN = 10;

/** Строка заголовка тоже строка таблицы: нумерация строк начинается с неё. */
const HEADER_ROWS = 1;

/** Что показать вместо таблицы, когда после отбора не осталось строк. */
export interface ConnectionTableEmpty {
  /** Отбор действует: поиск или фасеты экрана. */
  filtered: boolean;
  /** Снимает отбор: кнопка на пустом экране обязана вернуть список. */
  reset: () => void;
}

const NO_FILTERED_COLUMNS: ReadonlySet<ConnectionField> = new Set();

/**
 * Карточка списка соединений: тулбар над вкладками и тело каждой вкладки.
 *
 * Тулбар один на экран, а тело своё у каждой вкладки: поиск, фасеты и вид
 * общие, а прокрутка и строки — нет. Поэтому таблица собрана из
 * частей, а не одним компонентом: экран ставит один `Toolbar` над вкладками и
 * по `Body` в каждую.
 *
 * Анатомия, виртуализация, политика сортировки и устройство прокрутки —
 * [гайд по таблицам](../../../../docs/guides/Tables.md).
 */
function ConnectionTableRoot({ children }: { children: ReactNode }) {
  return (
    <section className={cn('flex min-h-0 grow flex-col overflow-hidden max-lg:min-h-96', SURFACE)}>{children}</section>
  );
}

/**
 * Тулбар карточки: поиск и фасеты слева, вид списка и действия над ним справа.
 * Вид меняет картинку, а не систему, поэтому стоит слева от действий и в их ряд
 * не входит.
 */
function ConnectionTableToolbar({
  view,
  search = null,
  actions = null,
  facets = null,
}: {
  /** Вид списка: он переживает перезагрузку, поэтому живёт снаружи таблицы. */
  view: ConnectionView;
  /** Поиск: левый край тулбара. */
  search?: ReactNode;
  /** Действия над списком: живут в карточке таблицы, а не в шапке страницы. */
  actions?: ReactNode;
  /**
   * Фасеты: в строку с поиском. На узкой ширине уходят отдельной строкой под
   * тулбар и прокручиваются по горизонтали, а не переносятся облаком.
   */
  facets?: ReactNode;
}) {
  return (
    <div className='flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3.5 py-2.5'>
      {search}
      {facets}
      <span className='grow' />
      <ConnectionColumnPicker view={view} />
      <ConnectionDensityToggle density={view.density} onDensityChange={view.setDensity} />
      <ConnectionRefreshSelect interval={view.interval} onIntervalChange={view.setInterval} />
      {actions}
    </div>
  );
}

/**
 * Тело вкладки: шапка с сортировкой, виртуализованные строки и подвал со
 * счётчиком.
 *
 * Мемоизировано ради скрытой вкладки: под `Activity` она перерисовывается
 * пониженным приоритетом на каждый новый пропс, а экран отдаёт ей замороженный
 * набор строк и стабильные колбэки — и тело не перерисовывается вовсе.
 *
 * Здесь важно одно, что легко сломать правкой: скроллер один и на обе оси, а
 * шапка внутри него липкая. Вертикальный вьюпорт внутри горизонтального
 * заводит собственную горизонтальную прокрутку и уезжает из-под шапки.
 */
function ConnectionTableBodyProto({
  rows,
  total,
  closable,
  empty,
  filtered,
  onReset,
  view,
  filteredColumns = NO_FILTERED_COLUMNS,
  footer = null,
  overflow = null,
  selectedId = null,
  explainPanelId,
  onExplain = null,
  onClosed = null,
}: {
  rows: ConnectionRowModel[];
  /** Сколько строк во вкладке до отбора: подвал сообщает обе величины. */
  total: number;
  closable: boolean;
  /** Что показать вместо таблицы, когда строк нет. */
  empty: (state: ConnectionTableEmpty) => ReactNode;
  /** Отбор экрана: поиск и фасеты. */
  filtered: boolean;
  onReset: () => void;
  view: ConnectionView;
  /** Колонки, по полю которых стоит фасет. Ссылка стабильная: тело мемоизировано. */
  filteredColumns?: ReadonlySet<ConnectionField>;
  /**
   * Выгрузка: подвал, рядом со счётчиком. Получает строки в показанном
   * порядке — уходит ровно то, что счётчик называет.
   */
  footer?: ((rows: ConnectionRowModel[]) => ReactNode) | null;
  /** Переполнение источника: строки, которых в списке уже нет. Стоит рядом со счётчиком. */
  overflow?: ReactNode;
  selectedId?: string | null;
  /** Идентификатор панели объяснения: строка ссылается на неё `aria-controls`. */
  explainPanelId?: string;
  /** `null` — объяснение маршрута выключено: у демона нет источника рантайма. */
  onExplain?: ((id: string) => void) | null;
  /** Рантайм закрыл соединение строки: экран объявляет это своей живой областью. */
  onClosed?: (() => void) | null;
}) {
  const { t } = useTranslation('widgets/ConnectionTable');
  const scrollRef = useRef<HTMLDivElement>(null);
  const close = useCloseConnection();
  const now = useNow();
  const narrow = useNarrowScreen();

  const onClose = useCallback(
    (id: string) => {
      // Колбэк `mutate` срабатывает только у последнего вызова: две строки,
      // закрытые подряд, дали бы одно объявление. Отказ показывает сама мутация.
      void Promise.allSettled([close.mutateAsync(id)]).then(function announceClosed([result]) {
        if (result.status === 'fulfilled') {
          onClosed?.();
        }
      });
    },
    [close, onClosed]
  );

  const devices = useDeviceIndex();
  // Новые описания колонок пересортировывают таблицу, поэтому они меняются
  // вместе со списком устройств, а не на каждый снапшот.
  const columnDefs = useMemo(() => toLabeledColumns((ip) => deviceLabel(ip, devices)), [devices]);

  const table = useTable(
    {
      features: CONNECTION_TABLE_FEATURES,
      columns: columnDefs,
      data: rows,
      state: { sorting: view.sorting, columnVisibility: view.columns, columnOrder: view.order },
      onSortingChange: view.setSorting,
      onColumnVisibilityChange: view.setColumns,
      onColumnOrderChange: view.setOrder,
    },
    (state) => state
  );

  // Строки уже отобраны экраном, модель таблицы их только сортирует.
  const visible = table.getRowModel().rows;
  const shownRows = useMemo(() => visible.map((row) => row.original), [visible]);
  const columns = toTableColumns(table, view.order).filter(({ column }) => column.getIsVisible());
  // Ссылка обязана быть стабильной: `ConnectionRow` мемоизирована, и новый
  // массив на каждый снапшот обнулял бы мемоизацию всех отрисованных строк.
  const cells = useMemo(
    () =>
      toOrderedColumns(view.order)
        .filter((def) => view.columns[def.id] !== false)
        .map((def) => ({
          id: def.id,
          className: def.meta.className,
          label: def.meta.label,
        })),
    [view.columns, view.order]
  );

  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (narrow ? CARD_ESTIMATE : DENSITY_ROW_ESTIMATE[view.density]),
    overscan: OVERSCAN,
  });

  return (
    <div className='flex min-h-0 grow flex-col'>
      {visible.length === 0 ? (
        <div className='flex grow items-center justify-center px-4 py-10 text-center'>
          {empty({ filtered, reset: onReset })}
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
            {!narrow && (
              <ConnectionTableHeader columns={columns} density={view.density} filteredColumns={filteredColumns} />
            )}

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
    </div>
  );
}

const ConnectionTableBody = memo(ConnectionTableBodyProto);

// Части собираются в `ConnectionTable.Root`, `.Toolbar` и `.Body` реэкспортом
// модуля целиком (`ui/index.ts`): объект-обёртка в этом файле выключил бы Fast
// Refresh для всех трёх.
export { ConnectionTableBody as Body, ConnectionTableRoot as Root, ConnectionTableToolbar as Toolbar };
