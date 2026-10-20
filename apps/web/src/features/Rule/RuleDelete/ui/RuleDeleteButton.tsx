import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { ConfigDocumentState, ruleNodePath } from '@entities/Config';
import { Button, ConfirmDialog } from '@shared/ui';

/**
 * Deleting a rule from the draft. Asks for confirmation: the draft has no
 * step-by-step undo, and a single rule can be brought back only by discarding
 * all edits.
 */
export function RuleDeleteButton({
  index,
  onDeleted,
}: {
  /** Rule number, from one. */
  index: number;
  onDeleted: () => void;
}) {
  const { t } = useTranslation('features/Rule/RuleDelete');
  const remove = ConfigDocumentState.use.remove();

  return (
    <ConfirmDialog
      trigger={
        <Button variant='ghost' size='icon-sm' aria-label={t('remove', { index })}>
          <Trash2 />
        </Button>
      }
      title={t('confirm.title', { index })}
      description={t('confirm.description')}
      cancelLabel={t('action.cancel', { ns: 'shared' })}
      confirmLabel={t('confirm.action')}
      destructive
      onConfirm={() => {
        onDeleted();
        remove(ruleNodePath(index));
      }}
    />
  );
}
