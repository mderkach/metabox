import { useTranslation } from 'react-i18next';

import { Button, ConfirmDialog } from '@shared/ui';

import { useDaemonRestart, useDaemonRestarting } from '../api';

/**
 * Restart of the panel's own daemon. Asks first: the panel goes silent for a few
 * seconds, and what the daemon keeps in memory starts over.
 */
export function DaemonRestart() {
  const { t } = useTranslation('features/Daemon/DaemonControl');
  const restart = useDaemonRestart();
  const restarting = useDaemonRestarting();

  return (
    <ConfirmDialog
      trigger={
        // The sing-box card next to it has its own "Restart": the name says which process.
        <Button variant='outline' size='sm' disabled={restarting} aria-label={t('restart.confirm')}>
          {t(restarting ? 'restart.pending' : 'restart.action')}
        </Button>
      }
      title={t('restart.title')}
      description={t('restart.description')}
      cancelLabel={t('action.cancel', { ns: 'shared' })}
      confirmLabel={t('restart.confirm')}
      onConfirm={() => {
        restart.mutate();
      }}
    />
  );
}
