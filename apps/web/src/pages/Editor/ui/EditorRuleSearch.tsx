import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Input, SEARCH_FIELD } from '@shared/ui';

import type { RuleFilterState } from '../lib/Editor.lib';

/** Search: left edge of the table toolbar. */
export function EditorRuleSearch({ filter }: { filter: RuleFilterState }) {
  const { t } = useTranslation('pages/Editor');

  return (
    <div className={SEARCH_FIELD}>
      <Search className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
      <Input
        value={filter.query}
        onChange={(event) => {
          filter.setQuery(event.target.value);
        }}
        placeholder={t('search.placeholder')}
        className='pl-8'
        aria-label={t('search.label')}
      />
    </div>
  );
}
