import { useTranslation } from 'react-i18next';

import { Button } from '@shared/ui';

import { PROXIES_NS } from '../i18n/Proxies.namespace.generated';
import type { ProxyRecoveryItem } from '../model/Proxies.recoveryState';

export function ProxiesRecoveryDetails({ item }: { item: ProxyRecoveryItem }) {
  const { t } = useTranslation(PROXIES_NS);

  return (
    <div className='mt-2 flex min-w-0 flex-col gap-3 rounded-md border bg-muted/40 p-3'>
      <h4 className='text-sm font-medium'>{t('recovery.title')}</h4>
      <p role='status' className='text-sm wrap-anywhere'>
        {t(
          item.state === 'suggested' && item.stage === undefined ? 'recovery.blocked' : `recovery.states.${item.state}`
        )}
      </p>
      {(item.stage !== undefined || item.retry !== undefined || item.restore !== undefined) && (
        <div className='flex flex-wrap gap-2'>
          {item.stage !== undefined && (
            <Button size='sm' onClick={item.stage} className='h-auto min-h-7 whitespace-normal'>
              {t('recovery.stage')}
            </Button>
          )}
          {item.restore !== undefined && (
            <Button size='sm' onClick={item.restore} className='h-auto min-h-7 whitespace-normal'>
              {t('recovery.restore')}
            </Button>
          )}
          {item.retry !== undefined && (
            <Button
              size='sm'
              variant='outline'
              onClick={item.retry}
              className='h-auto min-h-7 border-muted-foreground bg-background whitespace-normal'
            >
              {t('recovery.retry')}
            </Button>
          )}
        </div>
      )}
      {item.state === 'no-response' && <p className='text-xs wrap-anywhere'>{t('recovery.source')}</p>}
    </div>
  );
}
