import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Alert, AlertDescription, AlertTitle, Button, DialogFooter } from '@shared/ui';

import { toClaudeCodeCommand } from '../model';
import { McpAccessCopyField } from './McpAccessCopyField';

/** The token right after it is issued: the daemon keeps only its hash, so this is the one place it can be read. */
export function McpAccessToken({
  token,
  url,
  announce,
  onDone,
}: {
  token: string;
  url: string;
  announce: (text: string) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation('features/Mcp/McpAccess');

  return (
    <div className='flex flex-col gap-3'>
      <Alert>
        <TriangleAlert aria-hidden='true' />
        <AlertTitle>{t('token.warning.title')}</AlertTitle>
        <AlertDescription>{t('token.warning.description')}</AlertDescription>
      </Alert>

      <McpAccessCopyField label={t('token.label')} value={token} focusOnMount announce={announce} />
      <McpAccessCopyField
        label={t('token.command')}
        value={toClaudeCodeCommand(url, token)}
        multiline
        announce={announce}
      />

      <DialogFooter>
        <Button type='button' onClick={onDone}>
          {t('token.done')}
        </Button>
      </DialogFooter>
    </div>
  );
}
