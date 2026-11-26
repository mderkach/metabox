import { useTranslation } from 'react-i18next';

import { Button, FORM_ACTIONS } from '@shared/ui';

import { MCP_ACCESS_NS } from '../i18n/McpAccess.namespace.generated';

export function McpAccessOff({ pending, onEnable }: { pending: boolean; onEnable: () => void }) {
  const { t } = useTranslation(MCP_ACCESS_NS);

  return (
    <div className='flex flex-col gap-3'>
      <p className='text-sm text-muted-foreground'>{t('off.status')}</p>
      <div className={FORM_ACTIONS}>
        <Button type='button' disabled={pending} onClick={onEnable}>
          {t('off.enable')}
        </Button>
      </div>
    </div>
  );
}
