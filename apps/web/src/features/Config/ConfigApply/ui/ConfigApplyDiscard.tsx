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
 * Discard of the whole draft.
 *
 * Asks for confirmation: the document has no step-by-step undo, and an
 * accidental press takes all the work away irreversibly. The outline in the
 * danger tone tells it from the bar buttons, which keep edits rather than erase
 * them.
 */
export function ConfigApplyDiscard({ label, onDiscard }: { label?: string; onDiscard: () => void }) {
  const { t } = useTranslation('features/Config/ConfigApply');
  const [open, setOpen] = useState(false);

  const onConfirmClick = useCallback(() => {
    setOpen(false);
    onDiscard();
  }, [onDiscard]);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant='outline' size='sm' className={DESTRUCTIVE_OUTLINE} />}>
        {label ?? t('bar.discard')}
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
