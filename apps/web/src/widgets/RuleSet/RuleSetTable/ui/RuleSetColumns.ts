import { tableFeatures, type AccessorFnColumnDef } from '@tanstack/react-table';
import type { ParseKeys } from 'i18next';

import type { RuleSetRow } from '@entities/RuleSet';

/**
 * Rule set row layout. One set of widths serves the header and the row: if they diverge,
 * labels end up above the wrong columns.
 */
export const RULE_SET_COLUMN = {
  /**
   * Below `md` the row is a grid: the actions stand beside the set name instead of
   * wrapping onto a line of their own under the usage.
   */
  Row: 'flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-4 py-3 last:border-b-0 max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto]',
  Tag: 'flex min-w-0 grow basis-56 flex-col gap-1 max-md:row-start-1',
  Source: 'flex min-w-0 grow basis-64 flex-col gap-0.5 text-xs text-muted-foreground max-md:col-span-2',
  Updated: 'w-32 shrink-0 text-right max-md:w-auto max-md:text-left',
  Size: 'w-20 shrink-0 text-right max-md:w-auto',
  Usage: 'w-36 shrink-0 text-right max-md:col-span-2 max-md:w-auto max-md:text-left',
  RowActions:
    'flex w-14 shrink-0 items-center justify-end gap-2 max-md:col-start-2 max-md:row-start-1 max-md:self-start',
} as const;

export const RULE_SET_FIELD = {
  Tag: 'tag',
  Source: 'source',
  Updated: 'updated',
  Size: 'size',
  Usage: 'usage',
} as const;

export type RuleSetField = (typeof RULE_SET_FIELD)[keyof typeof RULE_SET_FIELD];

export interface RuleSetCellProps {
  set: RuleSetRow;
}

/**
 * No feature is plugged in: the list goes in file order, and there is nothing to hide
 * in five columns yet. The model gives the row set the header and rows are drawn from.
 */
export const RULE_SET_TABLE_FEATURES = tableFeatures({});

export type RuleSetTableFeatures = typeof RULE_SET_TABLE_FEATURES;

export interface RuleSetColumnMeta {
  label: ParseKeys<'widgets/RuleSet/RuleSetTable'>;
  className: string;
}

/** The library keeps `id` as a string and `meta` as optional; for these columns both are guaranteed. */
export type RuleSetColumnDef = AccessorFnColumnDef<RuleSetTableFeatures, RuleSetRow> & {
  id: RuleSetField;
  meta: RuleSetColumnMeta;
};

/**
 * Rule set columns. Update time and size are two questions, "is the set fresh" and
 * "what does it cost the router", so they are two columns.
 */
export const RULE_SET_COLUMNS: readonly RuleSetColumnDef[] = [
  {
    id: RULE_SET_FIELD.Tag,
    accessorFn: (row) => row.tag,
    meta: { label: 'column.set', className: RULE_SET_COLUMN.Tag },
  },
  {
    id: RULE_SET_FIELD.Source,
    accessorFn: (row) => row.source.providerName ?? '',
    meta: { label: 'column.source', className: RULE_SET_COLUMN.Source },
  },
  {
    id: RULE_SET_FIELD.Updated,
    accessorFn: (row) => row.file?.modifiedAt ?? null,
    meta: { label: 'column.updated', className: RULE_SET_COLUMN.Updated },
  },
  {
    id: RULE_SET_FIELD.Size,
    accessorFn: (row) => row.file?.size ?? null,
    meta: { label: 'column.size', className: RULE_SET_COLUMN.Size },
  },
  {
    id: RULE_SET_FIELD.Usage,
    accessorFn: (row) => row.usedBy,
    meta: { label: 'column.usage', className: RULE_SET_COLUMN.Usage },
  },
];
