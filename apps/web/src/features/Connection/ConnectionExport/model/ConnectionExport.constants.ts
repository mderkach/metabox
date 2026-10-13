export const EXPORT_FORMAT = {
  Csv: 'csv',
  Json: 'json',
} as const;

export type ExportFormat = (typeof EXPORT_FORMAT)[keyof typeof EXPORT_FORMAT];

/**
 * Export column composition and order: the file header and the row read it
 * together. Device and address are two columns: a person reads the name, while
 * the address is what is matched against router logs and between exports.
 */
export const CSV_COLUMNS = [
  'host',
  'device',
  'source',
  'network',
  'rule',
  'action',
  'chain',
  'download',
  'upload',
  'downRate',
  'upRate',
  'startedAt',
] as const;

export const MIME = {
  [EXPORT_FORMAT.Csv]: 'text/csv;charset=utf-8',
  [EXPORT_FORMAT.Json]: 'application/json;charset=utf-8',
} as const;
