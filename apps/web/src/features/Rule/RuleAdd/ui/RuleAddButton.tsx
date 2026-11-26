import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { SHORTCUT } from '@shared/lib/shortcuts';
import { Button, ShortcutKbd } from '@shared/ui';

import { RULE_ADD_NS } from '../i18n/RuleAdd.namespace.generated';

/**
 * Opens a new rule in the panel. Nothing is written until the rule gets a
 * condition: a rule without one would take all traffic.
 *
 * Without an outbound the button goes dim and says why: sing-box rejects a
 * rule without `outbound`, and the panel may not invent a tag that is not in
 * the config.
 */
export function RuleAddButton({ disabled, onAdd }: { disabled: boolean; onAdd: () => void }) {
  const { t } = useTranslation(RULE_ADD_NS);

  return (
    <>
      {disabled && <p className='text-xs text-muted-foreground'>{t('unavailable')}</p>}
      <Button variant='outline' size='sm' disabled={disabled} aria-keyshortcuts={SHORTCUT.Add} onClick={onAdd}>
        <Plus />
        {t('add')}
        <ShortcutKbd shortcut={SHORTCUT.Add} />
      </Button>
    </>
  );
}
