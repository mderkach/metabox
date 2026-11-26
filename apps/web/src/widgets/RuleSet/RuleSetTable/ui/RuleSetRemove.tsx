import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { SHARED_NS } from '@shared/i18n';
import { Button, ConfirmDialog } from '@shared/ui';

import { RULE_SET_TABLE_NS } from '../i18n/RuleSetTable.namespace.generated';

/**
 * Removing a rule set from the draft. Asks for confirmation: the draft has no step-by-step
 * undo, and removal does not clear rule references to the rule set — with them
 * sing-box will not accept the config.
 */
export function RuleSetRemove({ tag, usedBy, onConfirm }: { tag: string; usedBy: number; onConfirm: () => void }) {
  const { t } = useTranslation(RULE_SET_TABLE_NS);

  return (
    <ConfirmDialog
      trigger={
        <Button variant='ghost' size='icon-sm' aria-label={t('row.remove', { tag })}>
          <Trash2 />
        </Button>
      }
      title={t('remove.title', { tag })}
      description={usedBy === 0 ? t('remove.description') : t('remove.used', { count: usedBy })}
      cancelLabel={t('action.cancel', { ns: SHARED_NS })}
      confirmLabel={t('remove.action')}
      destructive
      onConfirm={onConfirm}
    />
  );
}
