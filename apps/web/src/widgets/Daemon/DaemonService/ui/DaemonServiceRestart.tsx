import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
} from '@shared/ui';

/** Asks first: a restart drops the current connections of all devices. */
export function DaemonServiceRestart({ disabled, onConfirm }: { disabled: boolean; onConfirm: () => void }) {
  const { t } = useTranslation('widgets/Daemon/DaemonService');
  const [open, setOpen] = useState(false);

  const onConfirmClick = useCallback(() => {
    setOpen(false);
    onConfirm();
  }, [onConfirm]);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant='outline' size='sm' disabled={disabled} />}>
        {t('action.restart')}
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('restart.title')}</AlertDialogTitle>
          <AlertDialogDescription>{t('restart.description')}</AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>{t('action.cancel', { ns: 'shared' })}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirmClick}>{t('restart.confirm')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
