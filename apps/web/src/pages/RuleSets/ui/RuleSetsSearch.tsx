import { useTranslation } from 'react-i18next';

import { SearchInput } from '@shared/ui';

import { type RuleSetFilterState } from '../lib/RuleSets.lib';

export function RuleSetsSearch({ filter }: { filter: RuleSetFilterState }) {
  const { t } = useTranslation('pages/RuleSets');

  return (
    <SearchInput
      value={filter.query}
      onValueChange={filter.setQuery}
      placeholder={t('search.placeholder')}
      aria-label={t('search.label')}
    />
  );
}
