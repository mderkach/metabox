import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@shared/ui';

import { EDITOR_NS } from '../i18n/Editor.namespace.generated';
import type { RuleFilterState } from '../lib/Editor.filter';

/**
 * Filter by the rule set from the address. Cleared right here: without the indicator a trimmed list
 * would read as the whole one.
 */
export function EditorRuleSetChip({ filter }: { filter: RuleFilterState }) {
  const { t } = useTranslation(EDITOR_NS);

  if (filter.ruleSet === null) {
    return null;
  }

  return (
    <Button
      variant='outline'
      size='sm'
      aria-label={t('ruleSet.clear', { tag: filter.ruleSet })}
      onClick={() => {
        filter.setRuleSet(null);
      }}
      className='border-selected-edge bg-selected text-foreground hover:bg-selected max-md:h-11'
    >
      {t('ruleSet.label')}
      <span className='font-mono'>{filter.ruleSet}</span>
      <X aria-hidden='true' />
    </Button>
  );
}
