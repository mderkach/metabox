import { RotateCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';
import { Button, ConfirmDialog, DESTRUCTIVE_OUTLINE } from '@shared/ui';

export function DaemonServiceRestart({
  disabled,
  emphasize,
  onConfirm,
}: {
  disabled: boolean;
  emphasize: boolean;
  onConfirm: () => void;
}) {
  const { t } = useTranslation('widgets/Daemon/DaemonService');

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
      cancelLabel={t('action.cancel', { ns: 'shared' })}
      confirmLabel={t('restart.confirm')}
      onConfirm={onConfirm}
    />
  );
}
