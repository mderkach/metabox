import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';
import { Input, SEARCH_FIELD } from '@shared/ui';

/**
 * Search: the left edge of the table toolbar. In a row with facets and actions
 * the field shrinks first, otherwise at laptop width the outermost action moves
 * to a separate row.
 */
export function ConnectionSearch({ query, onQueryChange }: { query: string; onQueryChange: (query: string) => void }) {
  const { t } = useTranslation('pages/Connections');

  return (
    <div className={cn(SEARCH_FIELD, 'md:w-auto md:min-w-48 md:flex-1 md:basis-60')}>
      <Search className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
      <Input
        value={query}
        onChange={(event) => {
          onQueryChange(event.target.value);
        }}
        placeholder={t('search.placeholder')}
        className='pl-8'
        aria-label={t('search.label')}
      />
    </div>
  );
}
