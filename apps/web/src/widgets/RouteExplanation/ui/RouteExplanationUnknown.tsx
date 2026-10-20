import { useTranslation } from 'react-i18next';

import { ROUTE_ORIGIN } from '@entities/Route';

import { RouteOriginBadge } from './RouteOriginBadge';

export function RouteExplanationUnknown({ reason }: { reason: string }) {
  const { t } = useTranslation('widgets/RouteExplanation');

  return (
    <section className='flex flex-col gap-1.5'>
      <div className='flex items-center gap-2'>
        <h3 className='text-sm font-medium'>{t('unknown.title')}</h3>
        <RouteOriginBadge origin={ROUTE_ORIGIN.Unknown} />
      </div>
      <p className='text-sm text-pretty text-muted-foreground'>{reason}</p>
    </section>
  );
}
