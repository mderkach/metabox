import { useTranslation } from 'react-i18next';

import { SearchInput } from '@shared/ui';

import { EDITOR_NS } from '../i18n/Editor.namespace.generated';
import type { RuleFilterState } from '../lib/Editor.lib';

/** Search: left edge of the table toolbar. */
export function EditorRuleSearch({ filter }: { filter: RuleFilterState }) {
  const { t } = useTranslation(EDITOR_NS);

  return (
    <SearchInput
      value={filter.query}
      onValueChange={filter.setQuery}
      placeholder={t('search.placeholder')}
      aria-label={t('search.label')}
    />
  );
}
