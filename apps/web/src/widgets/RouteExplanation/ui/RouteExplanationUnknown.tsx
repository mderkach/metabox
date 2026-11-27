import { useTranslation } from 'react-i18next';

import { ROUTE_ORIGIN } from '@entities/Route';
import { RouteOriginBadge } from '@entities/Route';

import { ROUTE_EXPLANATION_NS } from '../i18n/RouteExplanation.namespace.generated';

export function RouteExplanationUnknown({ reason }: { reason: string }) {
  const { t } = useTranslation(ROUTE_EXPLANATION_NS);

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
