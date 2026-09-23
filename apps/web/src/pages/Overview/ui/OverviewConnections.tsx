import { useTranslation } from 'react-i18next';

import { CARD_FLUSH, Card } from '@shared/ui';
import { ConnectionHistory } from '@widgets/ConnectionHistory';
import { ConnectionSummaryAction, ConnectionSummaryNetwork, ConnectionSummaryTop } from '@widgets/ConnectionSummary';
import { ProxyLatency } from '@widgets/ProxyLatency';

import type { OverviewRuntime } from '../lib';
import { OverviewSection } from './OverviewSection';
import { OverviewTile } from './OverviewTile';

export function OverviewConnections({ runtime }: { runtime: OverviewRuntime }) {
  const { t } = useTranslation('pages/Overview');

  return (
    <OverviewSection title={t('connections.title')} note={t('connections.note')}>
      <div className='grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3'>
        <Card className={CARD_FLUSH}>
          <ul aria-label={t('connections.label')} className='grid grid-cols-2 gap-px bg-border'>
            <OverviewTile
              label={t('connections.open')}
              value={String(runtime.counts.active)}
              context={t('connections.peak', { count: Math.max(...runtime.history, runtime.counts.active) })}
            />
            <OverviewTile
              label={t('connections.closed')}
              value={String(runtime.counts.closed)}
              context={runtime.counts.closed > 0 ? t('connections.keptByPanel') : t('connections.none')}
            />
          </ul>
        </Card>

        {/* Семь карточек на три колонки: две растянуты, иначе в последнем
            ряду остаётся пустая ячейка. */}
        <div className='xl:col-span-2'>
          <ConnectionHistory samples={runtime.history} />
        </div>
        <ConnectionSummaryAction shares={runtime.summary.actions} />
        <ConnectionSummaryNetwork shares={runtime.summary.networks} />
        <ConnectionSummaryTop
          title={t('connections.topNodes')}
          href='/proxies'
          shares={runtime.summary.nodes}
          empty={t('connections.topNodesEmpty')}
        />
        <ConnectionSummaryTop
          title={t('connections.topSources')}
          href='/connections'
          shares={runtime.summary.sources}
          empty={t('connections.topSourcesEmpty')}
        />
        <div className='sm:col-span-2'>
          <ProxyLatency />
        </div>
      </div>
    </OverviewSection>
  );
}
