export const OUTBOUND_ROW_GRID =
  'grid min-w-0 gap-x-3 gap-y-3 px-4 py-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1.1fr)_9.375rem_7.5rem_5.75rem] lg:gap-x-4';

export const OUTBOUND_LEADING_COLUMNS = {
  Stacked: ['identity', 'rules'],
  Wide: ['rules', 'identity'],
} as const;
