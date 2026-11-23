import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui';

export function SimpleRoutesRuleFilter({ tags, outbound }: { tags: readonly string[]; outbound?: string }) {
  const { t } = useTranslation('pages/SimpleRoutes');
  const navigate = useNavigate({ from: '/config/simple' });
  const items = [{ value: '', label: t('list.all') }, ...tags.map((tag) => ({ value: tag, label: tag }))];

  return (
    <Select
      items={items}
      value={outbound ?? ''}
      onValueChange={(value: string | null) => {
        void navigate({ search: { outbound: value === '' ? undefined : (value ?? undefined) }, resetScroll: false });
      }}
    >
      <SelectTrigger aria-label={t('list.filter')} size='sm' className='max-w-full'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map(({ value, label }) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
