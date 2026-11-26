import { useTranslation } from 'react-i18next';

import { useProxies, useProxyProviders } from '@entities/Proxy';

import { RULE_CATALOG_ADD_NS } from '../i18n/RuleCatalogAdd.namespace.generated';

export function RuleCatalogAddSubscriptionRuntime({
  providerTags,
  group,
}: {
  providerTags: ReadonlySet<string>;
  group?: string;
}) {
  const { t } = useTranslation(RULE_CATALOG_ADD_NS);
  const providers = useProxyProviders();
  const proxies = useProxies();
  const names = new Set(
    providers.data?.filter(({ name }) => providerTags.has(name)).flatMap(({ nodeNames }) => nodeNames)
  );
  const nodes =
    group === undefined ? proxies.data?.standalone : proxies.data?.groups.find(({ name }) => name === group)?.nodes;
  const count = nodes?.filter(({ name }) => names.has(name)).length ?? 0;
  let status: string;
  if (providers.isError || proxies.isError) status = t('subscriptionUnknown');
  else if (providers.isFetching || proxies.isFetching) status = t('subscriptionLoading');
  else status = t(group === undefined ? 'subscriptionLoaded' : 'subscriptionGroupLoaded', { count });

  return (
    <p role='status' className='text-sm text-muted-foreground'>
      {status}
    </p>
  );
}
