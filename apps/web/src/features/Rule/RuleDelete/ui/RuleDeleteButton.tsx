import { Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ConfigDocumentState, ruleNodePath } from '@entities/Config';
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
 * Удаление правила из черновика. Спрашивает подтверждение: пошаговой отмены у
 * черновика нет, и вернуть одно правило можно только сбросом всех правок.
 */
export function RuleDeleteButton({
  index,
  onDeleted,
}: {
  /** Номер правила, с единицы. */
  index: number;
  onDeleted: () => void;
}) {
  const { t } = useTranslation('features/Rule/RuleDelete');
  const remove = ConfigDocumentState.use.remove();
  const [open, setOpen] = useState(false);

  const onConfirmClick = useCallback(() => {
    setOpen(false);
    onDeleted();
    remove(ruleNodePath(index));
  }, [index, onDeleted, remove]);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant='ghost' size='icon-sm' aria-label={t('remove', { index })} />}>
        <Trash2 />
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('confirm.title', { index })}</AlertDialogTitle>
          <AlertDialogDescription>{t('confirm.description')}</AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>{t('action.cancel', { ns: 'shared' })}</AlertDialogCancel>
          <AlertDialogAction variant='destructive' onClick={onConfirmClick}>
            {t('confirm.action')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
