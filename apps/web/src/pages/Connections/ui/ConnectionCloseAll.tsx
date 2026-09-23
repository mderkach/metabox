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
  DESTRUCTIVE_OUTLINE,
} from '@shared/ui';

/**
 * Разрыв всех живых соединений. Спрашивает подтверждение: отменить действие
 * нельзя, а последствие видно не на экране, а на устройствах в сети.
 *
 * Контур в тоне опасности, а не заливка: залитый тон среди обычных кнопок
 * читается как сообщение об ошибке.
 */
export function ConnectionCloseAll({
  count,
  disabled = false,
  onConfirm,
}: {
  count: number;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  const { t } = useTranslation('pages/Connections');
  const [open, setOpen] = useState(false);

  const onConfirmClick = useCallback(() => {
    setOpen(false);
    onConfirm();
  }, [onConfirm]);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={<Button variant='outline' size='sm' disabled={disabled} className={DESTRUCTIVE_OUTLINE} />}
      >
        {t('closeAll.action')}
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('closeAll.title')}</AlertDialogTitle>
          <AlertDialogDescription>{t('closeAll.description', { count })}</AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>{t('action.cancel', { ns: 'shared' })}</AlertDialogCancel>
          <AlertDialogAction variant='destructive' onClick={onConfirmClick}>
            {t('closeAll.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
