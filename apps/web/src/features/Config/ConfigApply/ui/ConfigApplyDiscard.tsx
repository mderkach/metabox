import { useTranslation } from 'react-i18next';

import { Button, ConfirmDialog, DESTRUCTIVE_OUTLINE } from '@shared/ui';

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
  return (
    <ConfirmDialog
      trigger={
        <Button variant='outline' size='sm' className={DESTRUCTIVE_OUTLINE}>
          {label ?? t('bar.discard')}
        </Button>
      }
      title={t('discard.title')}
      description={t('discard.description')}
      cancelLabel={t('discard.cancel')}
      confirmLabel={t('discard.confirm')}
      destructive
      onConfirm={onDiscard}
    />
  );
}
