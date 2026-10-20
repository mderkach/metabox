import { useTranslation } from 'react-i18next';

import { Button, ConfirmDialog } from '@shared/ui';

/** Asks first: a restart drops the current connections of all devices. */
export function DaemonServiceRestart({ disabled, onConfirm }: { disabled: boolean; onConfirm: () => void }) {
  const { t } = useTranslation('widgets/Daemon/DaemonService');

  return (
    <ConfirmDialog
      trigger={
        <Button variant='outline' size='sm' disabled={disabled}>
          {t('action.restart')}
        </Button>
      }
      title={t('restart.title')}
      description={t('restart.description')}
      cancelLabel={t('action.cancel', { ns: 'shared' })}
      confirmLabel={t('restart.confirm')}

      onConfirm={onConfirm}
    />
  );
}
