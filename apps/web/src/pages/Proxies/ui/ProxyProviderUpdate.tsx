import { useTranslation } from 'react-i18next';

import { useUpdateProxyProvider } from '@features/Proxy/ProxyProviderUpdate';
import { Button } from '@shared/ui';

import { PROXIES_NS } from '../i18n/Proxies.namespace.generated';

export function ProxyProviderUpdate({ name }: { name: string }) {
  const { t } = useTranslation(PROXIES_NS);
  const update = useUpdateProxyProvider();

  return (
    <Button
      variant='outline'
      size='sm'
      aria-label={t('providers.updateLabel', { name })}
      disabled={update.isPending}
      onClick={() => {
        update.mutate(name);
      }}
    >
      {update.isPending ? t('providers.updating') : t('providers.update')}
    </Button>
  );
}
