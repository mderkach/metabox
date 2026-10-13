import type { ConnectionRow, ConnectionSourceLabel } from '@entities/Connection';

import { CSV_COLUMNS, EXPORT_FORMAT, type ExportFormat } from '../model/ConnectionExport.constants';

const JSON_INDENT = 2;

/**
 * RFC 4180 escaping: commas occur in the chain and the rule, and quotes from
 * sniff occur in domains. Without quotes such a row shifts the columns.
 */
function toCsvCell(value: string | number): string {
  const text = String(value);

  return /[",\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows: ConnectionRow[], sourceLabel: ConnectionSourceLabel): string {
  const header = CSV_COLUMNS.join(',');
  const lines = rows.map((row) =>
    [
      row.host,
      sourceLabel(row.source),
      row.source,
      row.network,
      row.rule,
      row.action,
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

export function toExportBody(rows: ConnectionRow[], format: ExportFormat, sourceLabel: ConnectionSourceLabel): string {
  if (format === EXPORT_FORMAT.Csv) {
    return toCsv(rows, sourceLabel);
  }

  // searchText is the screen search index, not a column: in the file it only gets in the way.
  const columns = rows.map(({ searchText: _searchText, ...rest }) => ({ ...rest, device: sourceLabel(rest.source) }));

  return JSON.stringify(columns, null, JSON_INDENT);
}
