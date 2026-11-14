import { useTranslation } from 'react-i18next';

import type { ProviderNodeChange } from '@entities/Proxy';

export function ProxyProviderNodes({ change }: { change: ProviderNodeChange }) {
  const { t } = useTranslation('pages/Proxies');
  const { before, after } = change;

  return (
    <span className='tabular-nums'>
      {before === null || before === after
        ? t('count.node', { ns: 'shared', count: after })
        : t('providers.nodesWas', { count: after, before })}
    </span>
  );
}
