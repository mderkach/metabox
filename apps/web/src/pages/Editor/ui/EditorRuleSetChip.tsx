import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';
import { FACET_ACTIVE, FACET_CLASS } from '@shared/ui';

import type { RuleFilterState } from '../lib/Editor.lib';

/**
 * Filter by the rule set from the address. Cleared right here: without the indicator a trimmed list
 * would read as the whole one.
 */
export function EditorRuleSetChip({ filter }: { filter: RuleFilterState }) {
  const { t } = useTranslation('pages/Editor');

  if (filter.ruleSet === null) {
    return null;
  }

  return (
    <button
      type='button'
      aria-label={t('ruleSet.clear', { tag: filter.ruleSet })}
      onClick={() => {
        filter.setRuleSet(null);
      }}
      className={cn(FACET_CLASS, FACET_ACTIVE)}
    >
      {t('ruleSet.label')}
      <span className='font-mono'>{filter.ruleSet}</span>
      <X className='size-3' aria-hidden='true' />
    </button>
  );
}
