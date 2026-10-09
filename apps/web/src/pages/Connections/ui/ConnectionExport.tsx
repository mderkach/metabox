import type { ParseKeys } from 'i18next';
import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { ConnectionRow, ConnectionSourceLabel } from '@entities/Connection';
import { downloadConnections, EXPORT_FORMAT, type ExportFormat } from '@features/Connection/ConnectionExport';
import { Button } from '@shared/ui';

const EXPORT_FORMATS = [
  { format: EXPORT_FORMAT.Csv, label: 'export.csv' },
  { format: EXPORT_FORMAT.Json, label: 'export.json' },
] as const satisfies readonly { format: ExportFormat; label: ParseKeys<'pages/Connections'> }[];

/** Выгрузка: подвал таблицы, рядом со счётчиком — уходит ровно то, что он называет. */
export function ConnectionExport({ rows, sourceLabel }: { rows: ConnectionRow[]; sourceLabel: ConnectionSourceLabel }) {
  const { t } = useTranslation('pages/Connections');

  return (
    <>
      {EXPORT_FORMATS.map(({ format, label }) => (
        <Button
          key={format}
          variant='ghost'
          size='xs'
          disabled={rows.length === 0}
          onClick={() => {
            downloadConnections(rows, format, new Date(), sourceLabel);
          }}
        >
          <Download />
          {t(label)}
        </Button>
      ))}
    </>
  );
}
