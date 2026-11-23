import { useTranslation } from 'react-i18next';

import { Card, CardContent } from '@shared/ui';

import { SimpleRoutesSection } from './SimpleRoutesSection';

export function SimpleRoutesDns({ servers, rules, final }: { servers: number; rules: number; final?: string }) {
  const { t } = useTranslation('pages/SimpleRoutes');

  return (
    <SimpleRoutesSection section='dns'>
      <Card size='sm'>
        <CardContent className='flex flex-col gap-1 text-sm'>
          <p>{t('dns.servers', { count: servers })}</p>
          <p className='text-muted-foreground'>{t('dns.rules', { count: rules })}</p>
          <p className='wrap-anywhere text-muted-foreground'>
            {final !== undefined && final !== '' ? t('dns.final', { tag: final }) : t('dns.finalUnknown')}
          </p>
        </CardContent>
      </Card>
    </SimpleRoutesSection>
  );
}
