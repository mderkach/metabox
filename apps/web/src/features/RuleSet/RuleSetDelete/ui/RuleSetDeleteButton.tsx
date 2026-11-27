import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { showQueryError } from '@shared/api';
import { SHARED_NS } from '@shared/i18n';
import { Button, ConfirmDialog } from '@shared/ui';

import { RULE_SET_DELETE_NS } from '../i18n/RuleSetDelete.namespace.generated';
import { removeRuleSet } from '../model/RuleSetDelete.model';

/**
 * Removing a rule set from the draft. Asks for confirmation: the draft has no step-by-step
 * undo, and removal does not clear rule references to the rule set — with them
 * sing-box will not accept the config.
 */
export function RuleSetDeleteButton({
  index,
  tag,
  usedBy,
  onNodeRemoved,
}: {
  index: number;
  tag: string;
  usedBy: number;
  onNodeRemoved: () => void;
}) {
  const { t } = useTranslation(RULE_SET_DELETE_NS);

  return (
    <ConfirmDialog
      trigger={
        <Button variant='ghost' size='icon-sm' aria-label={t('remove', { tag })}>
          <Trash2 />
        </Button>
      }
      title={t('confirm.title', { tag })}
      description={usedBy === 0 ? t('confirm.description') : t('confirm.used', { count: usedBy })}
      cancelLabel={t('action.cancel', { ns: SHARED_NS })}
      confirmLabel={t('confirm.action')}
      destructive
      onConfirm={() => {
        if (!removeRuleSet(index, onNodeRemoved)) {
          showQueryError({ showError: true, errorMessageKey: 'toast.config.edit.failed' }, null);
        }
      }}
    />
  );
}
