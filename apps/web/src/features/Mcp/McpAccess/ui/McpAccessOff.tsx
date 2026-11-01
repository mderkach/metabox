import { useTranslation } from 'react-i18next';

import { Button, FORM_ACTIONS } from '@shared/ui';

export function McpAccessOff({ pending, onEnable }: { pending: boolean; onEnable: () => void }) {
  const { t } = useTranslation('features/Mcp/McpAccess');

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
