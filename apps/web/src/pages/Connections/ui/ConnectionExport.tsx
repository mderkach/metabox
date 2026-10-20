import type { ParseKeys } from 'i18next';
import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { ConnectionRow, ConnectionSourceLabel } from '@entities/Connection';
import { downloadConnections, EXPORT_FORMAT, type ExportFormat } from '@features/Connection/ConnectionExport';
import { useNarrowScreen } from '@shared/lib/media';
import { Button } from '@shared/ui';

import { ConnectionExportMenu } from './ConnectionExportMenu';

const EXPORT_FORMATS = [
  { format: EXPORT_FORMAT.Csv, label: 'export.csv' },
  { format: EXPORT_FORMAT.Json, label: 'export.json' },
] as const satisfies readonly { format: ExportFormat; label: ParseKeys<'pages/Connections'> }[];

/** Export: the table footer, next to the counter; exactly what it names is exported. */
export function ConnectionExport({ rows, sourceLabel }: { rows: ConnectionRow[]; sourceLabel: ConnectionSourceLabel }) {
  const { t } = useTranslation('pages/Connections');
  const narrow = useNarrowScreen();
  const disabled = rows.length === 0;
  const onExport = (format: ExportFormat) => {
    downloadConnections(rows, format, new Date(), sourceLabel);
  };

  if (narrow) {
    return <ConnectionExportMenu formats={EXPORT_FORMATS} disabled={disabled} onExport={onExport} />;
  }

  return (
    <>
      {EXPORT_FORMATS.map(({ format, label }) => (
        <Button
          key={format}
          variant='ghost'
          size='xs'
          disabled={disabled}
          onClick={() => {
            onExport(format);
          }}
        >
          <Download />
          {t(label)}
        </Button>
      ))}
    </>
  );
}
