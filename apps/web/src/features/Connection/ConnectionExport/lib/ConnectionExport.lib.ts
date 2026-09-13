import type { ConnectionRow } from '@entities/Connection';

export const EXPORT_FORMAT = {
  Csv: 'csv',
  Json: 'json',
} as const;

export type ExportFormat = (typeof EXPORT_FORMAT)[keyof typeof EXPORT_FORMAT];

const CSV_COLUMNS = [
  'host',
  'source',
  'network',
  'rule',
  'outcome',
  'chain',
  'download',
  'upload',
  'downRate',
  'upRate',
  'startedAt',
] as const;

const MIME = {
  [EXPORT_FORMAT.Csv]: 'text/csv;charset=utf-8',
  [EXPORT_FORMAT.Json]: 'application/json;charset=utf-8',
} as const;

const JSON_INDENT = 2;

/** `2026-09-13T15:04:05` — ISO без миллисекунд и зоны: имя файла, а не метка времени. */
const ISO_SECONDS_LENGTH = 19;

/**
 * Экранирование по RFC 4180: в цепочке и правиле встречаются запятые, а в
 * доменах — кавычки от sniff'а. Без кавычек такая строка сдвигает колонки.
 */
function toCsvCell(value: string | number): string {
  const text = String(value);

  return /[",\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows: ConnectionRow[]): string {
  const header = CSV_COLUMNS.join(',');
  const lines = rows.map((row) =>
    [
      row.host,
      row.source,
      row.network,
      row.rule,
      row.outcome,
      row.chain.join(' → '),
      row.download,
      row.upload,
      Math.round(row.downRate),
      Math.round(row.upRate),
      new Date(row.startedAt).toISOString(),
    ]
      .map(toCsvCell)
      .join(',')
  );

  return [header, ...lines].join('\n');
}

export function toExportBody(rows: ConnectionRow[], format: ExportFormat): string {
  return format === EXPORT_FORMAT.Csv ? toCsv(rows) : JSON.stringify(rows, null, JSON_INDENT);
}

/**
 * Выгрузка отфильтрованного списка файлом. Blob и ссылка, а не ручка демона:
 * данные уже в панели, и лишний обход через устройство только добавил бы
 * состояние, которое может разойтись с экраном.
 *
 * Ссылка добавляется в документ, а объектный URL отзывается следующим кадром:
 * Firefox не запускает скачивание по клику вне документа, а отзыв сразу после
 * `click()` успевает освободить blob до того, как браузер начнёт его читать.
 */
export function downloadConnections(rows: ConnectionRow[], format: ExportFormat, stamp: Date) {
  const body = toExportBody(rows, format);
  const url = URL.createObjectURL(new Blob([body], { type: MIME[format] }));
  const link = document.createElement('a');

  link.href = url;
  link.download = `metabox-connections-${stamp.toISOString().slice(0, ISO_SECONDS_LENGTH).replaceAll(':', '-')}.${format}`;
  link.hidden = true;
  document.body.append(link);
  link.click();

  globalThis.requestAnimationFrame(function releaseBlob() {
    link.remove();
    URL.revokeObjectURL(url);
  });
}
