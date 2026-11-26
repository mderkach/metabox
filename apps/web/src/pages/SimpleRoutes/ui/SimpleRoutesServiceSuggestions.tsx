import { useTranslation } from 'react-i18next';

import { isCatalogCategory, RULE_SET_LIST_KIND, useRuleSetCatalog } from '@entities/RuleSet';
import { Button, DialogTrigger } from '@shared/ui';

import { SIMPLE_ROUTES_NS } from '../i18n/SimpleRoutes.namespace.generated';
import { SIMPLE_SERVICE_SUGGESTIONS_ID } from '../model/SimpleRoutes.model';

const SERVICES = ['YouTube', 'Instagram', 'ChatGPT', 'Claude', 'Discord', 'Spotify', 'GitHub'];

export function SimpleRoutesServiceSuggestions() {
  const { t } = useTranslation(SIMPLE_ROUTES_NS);
  const catalog = useRuleSetCatalog();
  const suggestions = SERVICES.filter(
    (name) =>
      catalog.data?.providers.some(({ lists }) =>
        lists.some((list) => list.kind === RULE_SET_LIST_KIND.Geosite && isCatalogCategory(list, name.toLowerCase()))
      ) === true
  );

  return (
    <div id={SIMPLE_SERVICE_SUGGESTIONS_ID} tabIndex={-1} className='flex flex-col gap-2'>
      <p className='text-sm text-muted-foreground'>{t('rules.suggestions')}</p>
      <div className='flex flex-wrap gap-2'>
        {suggestions.map((service) => (
          <DialogTrigger key={service} data-service={service} render={<Button variant='outline' size='sm' />}>
            {service}
          </DialogTrigger>
        ))}
        <DialogTrigger render={<Button variant='outline' size='sm' />}>{t('catalog.findAnother')}</DialogTrigger>
      </div>
    </div>
  );
}
