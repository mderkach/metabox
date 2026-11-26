import { useTranslation } from 'react-i18next';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui';

import { SIMPLE_ROUTES_NS } from '../i18n/SimpleRoutes.namespace.generated';
import type { SimpleRuleNavigation } from '../model/SimpleRoutes.links';

export function SimpleRoutesRuleFilter({
  tags,
  outbound,
  onOutboundChange,
}: Pick<SimpleRuleNavigation, 'onOutboundChange'> & { tags: readonly string[]; outbound?: string }) {
  const { t } = useTranslation(SIMPLE_ROUTES_NS);
  const items = [{ value: '', label: t('list.all') }, ...tags.map((tag) => ({ value: tag, label: tag }))];

  return (
    <Select
      items={items}
      value={outbound ?? ''}
      onValueChange={(value: string | null) => {
        onOutboundChange(value === '' ? undefined : (value ?? undefined));
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
