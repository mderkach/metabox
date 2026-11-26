import { useTranslation } from 'react-i18next';

import type { ProviderNodeChange } from '@entities/Proxy';
import { SHARED_NS } from '@shared/i18n';

import { PROXIES_NS } from '../i18n/Proxies.namespace.generated';

export function ProxyProviderNodes({ change }: { change: ProviderNodeChange }) {
  const { t } = useTranslation(PROXIES_NS);
  const { before, after } = change;

  return (
    <span className='tabular-nums'>
      {before === null || before === after
        ? t('count.node', { ns: SHARED_NS, count: after })
        : t('providers.nodesWas', { count: after, before })}
    </span>
  );
}
