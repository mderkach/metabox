import { useTranslation } from 'react-i18next';

import { Button, ConfirmDialog, DESTRUCTIVE_OUTLINE } from '@shared/ui';

/**
 * Stopping sing-box. Asks for confirmation: stopping cuts off
 * routing for the whole network, and a miss onto the neighboring "Restart" costs
 * internet access for all devices.
 */
export function DaemonServiceStop({ disabled, onConfirm }: { disabled: boolean; onConfirm: () => void }) {
  const { t } = useTranslation('widgets/Daemon/DaemonService');

  return (
    <ConfirmDialog
      trigger={
        <Button variant='outline' size='sm' disabled={disabled} className={DESTRUCTIVE_OUTLINE}>
          {t('action.stop')}
        </Button>
      }
      title={t('stop.title')}
      description={t('stop.description')}
      cancelLabel={t('action.cancel', { ns: 'shared' })}
      confirmLabel={t('stop.confirm')}
      destructive
      onConfirm={onConfirm}
    />
  );
}
