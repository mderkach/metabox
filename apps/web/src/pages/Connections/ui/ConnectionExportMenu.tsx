import type { ParseKeys } from 'i18next';
import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { ExportFormat } from '@features/Connection/ConnectionExport';
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@shared/ui';

/** Export formats under one button: on a phone two buttons crowd the counter out of the footer. */
export function ConnectionExportMenu({
  formats,
  disabled,
  onExport,
}: {
  formats: readonly { format: ExportFormat; label: ParseKeys<'pages/Connections'> }[];
  disabled: boolean;
  onExport: (format: ExportFormat) => void;
}) {
  const { t } = useTranslation('pages/Connections');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant='ghost' size='xs' disabled={disabled} />}>
        <Download />
        {t('export.menu')}
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-auto'>
        {formats.map(({ format, label }) => (
          <DropdownMenuItem
            key={format}
            onClick={() => {
              onExport(format);
            }}
          >
            {t(label)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
