import { useTranslation } from 'react-i18next';

import { Button } from '@shared/ui';

import { useUpdateProxyProvider } from '../api/ProxyProviderUpdate.api';
import { PROXY_PROVIDER_UPDATE_NS } from '../i18n/ProxyProviderUpdate.namespace.generated';

export function ProxyProviderUpdate({ name }: { name: string }) {
  const { t } = useTranslation(PROXY_PROVIDER_UPDATE_NS);
  const update = useUpdateProxyProvider();

  return (
    <Button
      variant='outline'
      size='sm'
      aria-label={t('updateLabel', { name })}
      disabled={update.isPending}
      onClick={() => {
        update.mutate(name);
      }}
    >
      {update.isPending ? t('updating') : t('update')}
    </Button>
  );
}
