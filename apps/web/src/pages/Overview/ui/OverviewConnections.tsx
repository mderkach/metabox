import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { deviceLabel, useDeviceIndex } from '@entities/Device';
import { CARD_FLUSH, Card } from '@shared/ui';
import { ConnectionHistory } from '@widgets/ConnectionHistory';
import { ConnectionSummaryAction, ConnectionSummaryNetwork, ConnectionSummaryTop } from '@widgets/ConnectionSummary';
import { ProxyLatency } from '@widgets/ProxyLatency';

import type { OverviewRuntime } from '../lib';
import { OverviewSection } from './OverviewSection';
import { OverviewTile } from './OverviewTile';

export function OverviewConnections({
  runtime,
  onLatencyTested,
}: {
  runtime: OverviewRuntime;
  onLatencyTested: () => void;
}) {
  const { t } = useTranslation('pages/Overview');
  // The overview is kept open for hours: a new device on the network should get a name
  // without a reload, so the device list is polled here.
  const devices = useDeviceIndex({ poll: true });
  const sourceLabel = useCallback((ip: string) => deviceLabel(ip, devices), [devices]);

  return (
    <OverviewSection title={t('section.connections', { ns: 'shared' })}>
      <div className='grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3'>
        <Card className={CARD_FLUSH}>
          <ul aria-label={t('connections.label')} className='grid grid-cols-2 gap-px bg-border'>
            <OverviewTile
              label={t('connections.open')}
              value={runtime.connectionsAwaiting ? null : String(runtime.counts.active)}
              context={
                runtime.connectionsAwaiting
                  ? null
                  : t('connections.peak', { count: Math.max(runtime.historyPeak, runtime.counts.active) })
              }
            />
            <OverviewTile
              label={t('connections.closed')}
              value={runtime.connectionsAwaiting ? null : String(runtime.counts.closed)}
              // Closed ones are accumulated by the tab: the source returns only live ones, so
              // zero right after opening is not a failure but the start of the count.
              context={runtime.connectionsAwaiting ? null : t('connections.keptByPanel')}
            />
          </ul>
        </Card>

        {/* Seven cards over three columns: two are stretched, otherwise the last
            row has an empty cell. */}
        <div className='xl:col-span-2'>
          <ConnectionHistory samples={runtime.history} sampledAt={runtime.historyAt} peak={runtime.historyPeak} />
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
          label={sourceLabel}
        />
        <div className='sm:col-span-2'>
          <ProxyLatency onTested={onLatencyTested} />
        </div>
      </div>
    </OverviewSection>
  );
}
