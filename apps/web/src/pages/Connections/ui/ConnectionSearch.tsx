import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Input } from '@shared/ui';

/** Поиск: левый край тулбара таблицы. */
export function ConnectionSearch({ query, onQueryChange }: { query: string; onQueryChange: (query: string) => void }) {
  const { t } = useTranslation('pages/Connections');

  return (
    <div className='relative w-full max-w-72'>
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
