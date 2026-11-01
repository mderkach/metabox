import { useTranslation } from 'react-i18next';

import { SearchInput } from '@shared/ui';

/**
 * Search: the left edge of the table toolbar. In a row with facets and actions
 * the field shrinks first, otherwise at laptop width the outermost action moves
 * to a separate row.
 */
export function ConnectionSearch({ query, onQueryChange }: { query: string; onQueryChange: (query: string) => void }) {
  const { t } = useTranslation('pages/Connections');

  return (
    <SearchInput
      value={query}
      onValueChange={onQueryChange}
      placeholder={t('search.placeholder')}
      aria-label={t('search.label')}
      className='md:w-auto md:min-w-48 md:flex-1 md:basis-60'
    />
  );
}
