import { useTranslation } from 'react-i18next';

import type { RouteExplanation as RouteExplanationModel } from '@entities/Route';
import { RouteOriginBadge } from '@entities/Route';

import { ROUTE_EXPLANATION_NS } from '../i18n/RouteExplanation.namespace.generated';

export function RouteExplanationChain({
  nodes,
  origin,
}: {
  nodes: string[];
  origin: RouteExplanationModel['chain']['origin'];
}) {
  const { t } = useTranslation(ROUTE_EXPLANATION_NS);

  if (nodes.length === 0) {
    return null;
  }

  return (
    <section className='flex flex-col gap-1.5'>
      <div className='flex items-center gap-2'>
        <h3 className='text-sm font-medium'>{t('chain.title')}</h3>
        <RouteOriginBadge origin={origin} />
      </div>
      <ol aria-label={t('chain.label')} className='flex flex-wrap items-center gap-1.5 font-mono text-xs'>
        {[...nodes].reverse().map((node) => (
          <li key={node} className='rounded-md bg-muted px-2 py-1'>
            {node}
          </li>
        ))}
      </ol>
    </section>
  );
}
