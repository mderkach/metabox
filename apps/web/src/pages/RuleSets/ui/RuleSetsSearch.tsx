import { useTranslation } from 'react-i18next';

import { SearchInput } from '@shared/ui';

import { RULE_SETS_NS } from '../i18n/RuleSets.namespace.generated';
import { type RuleSetFilterState } from '../lib/RuleSets.lib';

export function RuleSetsSearch({ filter }: { filter: RuleSetFilterState }) {
  const { t } = useTranslation(RULE_SETS_NS);

  return (
    <SearchInput
      value={filter.query}
      onValueChange={filter.setQuery}
      placeholder={t('search.placeholder')}
      aria-label={t('search.label')}
    />
  );
}
