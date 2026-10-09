import { Trash2 } from 'lucide-react';
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

/**
 * Удаление набора из черновика. Спрашивает подтверждение: пошаговой отмены у
 * черновика нет, а ссылки правил на набор удаление не снимает — с ними
 * sing-box конфиг не примет.
 */
export function RuleSetRemove({ tag, usedBy, onConfirm }: { tag: string; usedBy: number; onConfirm: () => void }) {
  const { t } = useTranslation('widgets/RuleSet/RuleSetTable');
  const [open, setOpen] = useState(false);

  const onConfirmClick = useCallback(() => {
    setOpen(false);
    onConfirm();
  }, [onConfirm]);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant='ghost' size='icon-sm' aria-label={t('row.remove', { tag })} />}>
        <Trash2 />
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('remove.title', { tag })}</AlertDialogTitle>
          <AlertDialogDescription>
            {usedBy === 0 ? t('remove.description') : t('remove.used', { count: usedBy })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>{t('action.cancel', { ns: 'shared' })}</AlertDialogCancel>
          <AlertDialogAction variant='destructive' onClick={onConfirmClick}>
            {t('remove.action')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
