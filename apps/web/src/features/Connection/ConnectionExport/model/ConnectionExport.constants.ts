export const EXPORT_FORMAT = {
  Csv: 'csv',
  Json: 'json',
} as const;

export type ExportFormat = (typeof EXPORT_FORMAT)[keyof typeof EXPORT_FORMAT];

/**
 * Состав и порядок колонок выгрузки: шапка файла и строка читают его вместе.
 * Устройство и адрес — два столбца: имя читает человек, а сверяет с журналами
 * роутера и сопоставляет между выгрузками адрес.
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
