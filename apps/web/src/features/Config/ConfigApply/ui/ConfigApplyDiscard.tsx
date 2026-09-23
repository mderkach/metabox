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
 * Сброс черновика целиком.
 *
 * Спрашивает подтверждение: пошаговой отмены у документа нет, и случайное
 * нажатие уносит всю работу без возврата. Контур в тоне опасности отличает его
 * от кнопок бара, которые правки сохраняют, а не стирают.
 */
export function ConfigApplyDiscard({ onDiscard }: { onDiscard: () => void }) {
  const { t } = useTranslation('features/Config/ConfigApply');
  const [open, setOpen] = useState(false);

  const onConfirmClick = useCallback(() => {
    setOpen(false);
    onDiscard();
  }, [onDiscard]);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant='outline' size='sm' className={DESTRUCTIVE_OUTLINE} />}>
        {t('bar.discard')}
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('discard.title')}</AlertDialogTitle>
          <AlertDialogDescription>{t('discard.description')}</AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>{t('discard.cancel')}</AlertDialogCancel>
          <AlertDialogAction variant='destructive' onClick={onConfirmClick}>
            {t('discard.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
