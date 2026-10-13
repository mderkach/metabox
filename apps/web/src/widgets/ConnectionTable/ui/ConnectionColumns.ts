import {
  columnOrderingFeature,
  columnVisibilityFeature,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_text,
  tableFeatures,
  type AccessorFnColumnDef,
  type Column,
  type ColumnOrderState,
  type Table,
} from '@tanstack/react-table';
import type { ParseKeys } from 'i18next';

import type { ConnectionRow, ConnectionSourceLabel } from '@entities/Connection';

/**
 * Column layout. Widths are distributed by content length: the rule
 * stretches over the remainder, the rest keep a fixed width.
 */
export const CONNECTION_COLUMN = {
  Row: 'flex w-full items-center gap-3 border-b border-border px-3.5 text-sm',
  Source: 'w-28 shrink-0',
  Host: 'sticky left-0 z-10 w-52 shrink-0 bg-inherit',
  Network: 'w-16 shrink-0',
  Rule: 'min-w-0 grow',
  Action: 'w-40 shrink-0',
  Chain: 'w-36 shrink-0',
  Rate: 'w-28 shrink-0 text-right',
  Volume: 'w-24 shrink-0 text-right',
  Age: 'w-20 shrink-0 text-right',
  RowActions: 'w-14 shrink-0',
} as const;

export const CONNECTION_FIELD = {
  Source: 'source',
  Host: 'host',
  Network: 'network',
  Rule: 'rule',
  Action: 'action',
  Chain: 'chain',
  Rate: 'rate',
  Volume: 'volume',
  Age: 'age',
} as const;

export type ConnectionField = (typeof CONNECTION_FIELD)[keyof typeof CONNECTION_FIELD];

export interface ConnectionCellProps {
  connection: ConnectionRow;
  /** Time reference moment for age. Passed in from outside, otherwise the row would lie about freshness. */
  now: number;
}

/** A visible column in the form the row draws it. */
export interface ConnectionCell {
  id: ConnectionField;
  className: string;
  /** The label is needed by the "label — value" list: in a table the header carries it. */
  label: ParseKeys<'widgets/ConnectionTable'>;
}

/**
 * Table capabilities are declared by name: they are optional, and only what is listed here
 * makes it into the build.
 */
export const CONNECTION_TABLE_FEATURES = tableFeatures({
  rowSortingFeature,
  columnVisibilityFeature,
  columnOrderingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { text: sortFn_text, basic: sortFn_basic, alphanumeric: sortFn_alphanumeric },
});

export type ConnectionTableFeatures = typeof CONNECTION_TABLE_FEATURES;

/** Label, layout class and a ban on hiding. */
export interface ConnectionColumnMeta {
  label: ParseKeys<'widgets/ConnectionTable'>;
  className: string;
  /**
   * Column width in `rem`, the same as `className` sets. The browser reads
   * the class, we read the number: the minimum table width is computed from it, and without
   * it that would be a constant for the full column set. Then hiding columns
   * would not narrow the table, which is what it was introduced for.
   */
  width: number;
  /** The column cannot be hidden: without it a row stops being recognizable. */
  required: boolean;
}

/** Gap between cells and row side margins in `rem`: the same as in `CONNECTION_COLUMN.Row`. */
const CELL_GAP = 0.75;
const ROW_PADDING = 1.75;

/** Row action column width and its minimum for the stretching rule column. */
const ROW_ACTIONS_WIDTH = 3.5;
const RULE_MIN_WIDTH = 10;

/**
 * Minimum table width for the visible column set.
 *
 * Computed rather than taken as a constant: one width for all sets would mean
 * that hiding columns does not narrow the table. One value for the row, the sticky header
 * and the row container — when they diverge, the header background breaks off in the middle
 * of scrolling.
 */
export function toTableMinWidth(columns: readonly Pick<ConnectionTableColumn, 'def'>[]): string {
  const cells = columns.reduce((sum, { def }) => sum + def.meta.width, ROW_ACTIONS_WIDTH);
  const gaps = columns.length * CELL_GAP;

  return `${String(cells + gaps + ROW_PADDING)}rem`;
}

/**
 * Definition with a narrowed identifier and a required `meta`. The library holds
 * `id` as a string and `meta` as optional; for our columns both are guaranteed, and
 * the header and row read the definition from here, not via the table state —
 * otherwise type casts appear.
 *
 * The type of an accessor column, not the general `ColumnDef`: that one is a union, and `accessorFn` is
 * optional in it. All columns of this table compute the value by a function, and
 * a column without one must be a compile error, not silently unsortable.
 */
export type ConnectionColumnDef = AccessorFnColumnDef<ConnectionTableFeatures, ConnectionRow> & {
  id: ConnectionField;
  meta: ConnectionColumnMeta;
};

/**
 * Connection table columns.
 *
 * One column is one field, one sort key, one filter; filtering by a field is
 * a facet in the screen toolbar, not a header filter. Source and host are separated
 * because they are different axes — who started and where it was going; rule, outbound and
 * chain are separated because they are three links of a causal chain: why it matched,
 * what was decided, what it went through. A composite cell remains only where two
 * values read as one fact and are not requested separately: the incoming and
 * outgoing direction of one quantity.
 *
 * Speed and volume are also different questions: "who is eating the channel now" and "who has
 * downloaded the most overall", so they have separate columns and separate sort keys.
 */
export const CONNECTION_COLUMNS: readonly ConnectionColumnDef[] = [
  {
    id: CONNECTION_FIELD.Source,
    // The device label is substituted by `toLabeledColumns`: the definition stays
    // data, while the device list arrives by request.
    accessorFn: (row) => row.source,
    // Character-by-character comparison puts 192.168.1.120 before 192.168.1.36: in an address
    // numeric chunks are compared as numbers, not as text.
    sortFn: 'alphanumeric',
    meta: { label: 'column.source', className: CONNECTION_COLUMN.Source, width: 7, required: false },
  },
  {
    id: CONNECTION_FIELD.Host,
    accessorFn: (row) => row.host,
    sortFn: 'alphanumeric',
    meta: { label: 'column.host', className: CONNECTION_COLUMN.Host, width: 13, required: true },
  },
  {
    id: CONNECTION_FIELD.Network,
    accessorFn: (row) => row.network,
    sortFn: 'text',
    meta: { label: 'column.network', className: CONNECTION_COLUMN.Network, width: 4, required: false },
  },
  {
    id: CONNECTION_FIELD.Rule,
    accessorFn: (row) => row.rule,
    sortFn: 'text',
    meta: { label: 'column.rule', className: CONNECTION_COLUMN.Rule, width: RULE_MIN_WIDTH, required: false },
  },
  {
    id: CONNECTION_FIELD.Action,
    accessorFn: (row) => row.action,
    sortFn: 'text',
    meta: { label: 'column.action', className: CONNECTION_COLUMN.Action, width: 10, required: true },
  },
  {
    id: CONNECTION_FIELD.Chain,
    accessorFn: (row) => row.chain.join(' '),
    sortFn: 'text',
    meta: { label: 'column.chain', className: CONNECTION_COLUMN.Chain, width: 9, required: false },
  },
  {
    id: CONNECTION_FIELD.Rate,
    accessorFn: (row) => row.downRate + row.upRate,
    sortFn: 'basic',
    sortDescFirst: true,
    meta: { label: 'column.rate', className: CONNECTION_COLUMN.Rate, width: 7, required: false },
  },
  {
    id: CONNECTION_FIELD.Volume,
    accessorFn: (row) => row.download + row.upload,
    sortFn: 'basic',
    sortDescFirst: true,
    meta: { label: 'column.volume', className: CONNECTION_COLUMN.Volume, width: 6, required: false },
  },
  {
    id: CONNECTION_FIELD.Age,
    // Age grows, so the start moment is compared: the younger ones are those where it is larger.
    accessorFn: (row) => row.startedAt,
    sortFn: 'basic',
    sortDescFirst: true,
    meta: { label: 'column.age', className: CONNECTION_COLUMN.Age, width: 5, required: false },
  },
];

/**
 * Table columns with a source label: sorting goes by the device name
 * visible in the cell, not by the address under it. An unnamed device
 * is labelled by address, and the address order stays numeric.
 */
export function toLabeledColumns(sourceLabel: ConnectionSourceLabel): readonly ConnectionColumnDef[] {
  return CONNECTION_COLUMNS.map((def) =>
    def.id === CONNECTION_FIELD.Source ? { ...def, accessorFn: (row: ConnectionRow) => sourceLabel(row.source) } : def
  );
}

/**
 * Columns hidden on first open.
 *
 * The network is almost always `tcp` and rarely decides the question; speed is overridden
 * by volume until one looks for who is occupying the channel right now. Both are turned on in one
 * click, and the row width without them fits a laptop screen without
 * horizontal scrolling.
 */
export const CONNECTION_COLUMNS_HIDDEN: Readonly<Partial<Record<ConnectionField, boolean>>> = {
  [CONNECTION_FIELD.Network]: false,
  [CONNECTION_FIELD.Rate]: false,
};

/** Column description together with its live state in the table. */
export interface ConnectionTableColumn {
  def: ConnectionColumnDef;
  column: Column<ConnectionTableFeatures, ConnectionRow>;
}

/**
 * Column descriptions in the order the user chose.
 *
 * Order is stored as a list of identifiers and survives panel versions:
 * an unfamiliar identifier is skipped, and a column absent from the list —
 * new or from a view saved before reordering — goes after the ordered ones in
 * definition order. An empty list means definition order.
 */
export function toOrderedColumns(order: ColumnOrderState): ConnectionColumnDef[] {
  const position = new Map(order.map((id, index) => [id, index]));

  return CONNECTION_COLUMNS.map((def, index) => ({ def, rank: position.get(def.id) ?? order.length + index }))
    .sort((left, right) => left.rank - right.rank)
    .map(({ def }) => def);
}

/**
 * Table columns in the chosen order.
 *
 * The walk goes over our own definitions, not `getVisibleLeafColumns`: there
 * `id` is a string and `meta` is optional, while here both are guaranteed. Filtering by
 * visibility is done by the caller. The field picker works without the table model and
 * reads the view directly via `toOrderedColumns`: the connection tabs have
 * one toolbar, and each has its own model.
 */
export function toTableColumns(
  table: Table<ConnectionTableFeatures, ConnectionRow>,
  order: ColumnOrderState
): ConnectionTableColumn[] {
  return toOrderedColumns(order).flatMap((def) => {
    const column = table.getColumn(def.id);

    return column === undefined ? [] : [{ def, column }];
  });
}
