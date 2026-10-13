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

/** Narrow-screen card estimate for the first frame: the virtualizer measures the exact height itself. */
const CARD_ESTIMATE = 108;
const OVERSCAN = 10;

/** The header row is also a table row: row numbering starts with it. */
const HEADER_ROWS = 1;

/** What to show instead of the table when no rows are left after filtering. */
export interface ConnectionTableEmpty {
  /** A filter is active: search or screen facets. */
  filtered: boolean;
  /** Clears the filter: the button on the empty screen must bring the list back. */
  reset: () => void;
}

const NO_FILTERED_COLUMNS: ReadonlySet<ConnectionField> = new Set();

/**
 * Connection list card: the toolbar above the tabs and the body of each tab.
 *
 * There is one toolbar per screen, and each tab has its own body: search, facets and view
 * are shared, while scrolling and rows are not. So the table is assembled from
 * parts rather than as one component: the screen places one `Toolbar` above the tabs and
 * a `Body` in each.
 *
 * Anatomy, virtualization, sort policy and scroll structure —
 * [tables guide](../../../../docs/guides/Tables.md).
 */
function ConnectionTableRoot({ children }: { children: ReactNode }) {
  return (
    <section className={cn('flex min-h-0 grow flex-col overflow-hidden max-lg:min-h-96', SURFACE)}>{children}</section>
  );
}

/**
 * Card toolbar: search and facets on the left, list view and list actions on the right.
 * The view changes the picture, not the system, so it stands to the left of the actions and is not part
 * of their row.
 */
function ConnectionTableToolbar({
  view,
  search = null,
  actions = null,
  facets = null,
}: {
  /** List view: it survives a reload, so it lives outside the table. */
  view: ConnectionView;
  /** Search: left edge of the toolbar. */
  search?: ReactNode;
  /** List actions: they live in the table card, not in the page header. */
  actions?: ReactNode;
  /**
   * Facets: in the search row. At a narrow width they go on a separate row under
   * the toolbar and scroll horizontally instead of wrapping as a cloud.
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
 * Tab body: header with sorting, virtualized rows and a footer with
 * the counter.
 *
 * Memoized for the hidden tab: under `Activity` it rerenders
 * at lowered priority on every new prop, and the screen gives it a frozen
 * row set and stable callbacks — and the body does not rerender at all.
 *
 * One thing matters here and is easy to break by an edit: there is one scroller for both axes, and
 * the header inside it is sticky. A vertical viewport inside a horizontal one
 * creates its own horizontal scrolling and slides out from under the header.
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
  /** How many rows are in the tab before filtering: the footer reports both values. */
  total: number;
  closable: boolean;
  /** What to show instead of the table when there are no rows. */
  empty: (state: ConnectionTableEmpty) => ReactNode;
  /** Screen filter: search and facets. */
  filtered: boolean;
  onReset: () => void;
  view: ConnectionView;
  /** Columns whose field has a facet. The reference is stable: the body is memoized. */
  filteredColumns?: ReadonlySet<ConnectionField>;
  /**
   * Export: footer, next to the counter. Receives rows in the shown
   * order — exactly what the counter names is exported.
   */
  footer?: ((rows: ConnectionRowModel[]) => ReactNode) | null;
  /** Source overflow: rows that are no longer in the list. Stands next to the counter. */
  overflow?: ReactNode;
  selectedId?: string | null;
  /** Explanation panel identifier: the row references it via `aria-controls`. */
  explainPanelId?: string;
  /** `null` means route explanation is off: the daemon has no runtime source. */
  onExplain?: ((id: string) => void) | null;
  /** The runtime closed the row's connection: the screen announces it with its live region. */
  onClosed?: (() => void) | null;
}) {
  const { t } = useTranslation('widgets/ConnectionTable');
  const scrollRef = useRef<HTMLDivElement>(null);
  const close = useCloseConnection();
  const now = useNow();
  const narrow = useNarrowScreen();

  const onClose = useCallback(
    (id: string) => {
      // The `mutate` callback fires only for the last call: two rows
      // closed in a row would give one announcement. The mutation itself shows a failure.
      void Promise.allSettled([close.mutateAsync(id)]).then(function announceClosed([result]) {
        if (result.status === 'fulfilled') {
          onClosed?.();
        }
      });
    },
    [close, onClosed]
  );

  const devices = useDeviceIndex();
  // New column definitions re-sort the table, so they change
  // together with the device list, not on every snapshot.
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

  // Rows are already filtered by the screen, the table model only sorts them.
  const visible = table.getRowModel().rows;
  const shownRows = useMemo(() => visible.map((row) => row.original), [visible]);
  const columns = toTableColumns(table, view.order).filter(({ column }) => column.getIsVisible());
  // The reference must be stable: `ConnectionRow` is memoized, and a new
  // array on every snapshot would reset memoization of all rendered rows.
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

// The parts are assembled into `ConnectionTable.Root`, `.Toolbar` and `.Body` by re-exporting
// the whole module (`ui/index.ts`): a wrapper object in this file would turn off Fast
// Refresh for all three.
export { ConnectionTableBody as Body, ConnectionTableRoot as Root, ConnectionTableToolbar as Toolbar };
