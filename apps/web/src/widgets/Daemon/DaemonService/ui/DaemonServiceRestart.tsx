import { RotateCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { SHARED_NS } from '@shared/i18n';
import { cn } from '@shared/lib/utils';
import { Button, ConfirmDialog, DESTRUCTIVE_OUTLINE } from '@shared/ui';

import { DAEMON_SERVICE_NS } from '../i18n/DaemonService.namespace.generated';

export function DaemonServiceRestart({
  disabled,
  emphasize,
  onConfirm,
}: {
  disabled: boolean;
  emphasize: boolean;
  onConfirm: () => void;
}) {
  const { t } = useTranslation(DAEMON_SERVICE_NS);

  return (
    <ConfirmDialog
      trigger={
        <Button
          variant='outline'
          size='sm'
          disabled={disabled}
          className={cn(emphasize && [DESTRUCTIVE_OUTLINE, 'dark:border-destructive/40'])}
        >
          {emphasize && <RotateCw aria-hidden='true' />}
          {t('action.restart')}
        </Button>
      }
      title={t('restart.title')}
      description={t('restart.description')}
      cancelLabel={t('action.cancel', { ns: SHARED_NS })}
      confirmLabel={t('restart.confirm')}
      onConfirm={onConfirm}
    />
  );
}
