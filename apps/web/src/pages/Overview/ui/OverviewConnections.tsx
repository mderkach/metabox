import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { deviceLabel, useDeviceIndex } from '@entities/Device';
import { ConnectionSummaryAction, ConnectionSummaryNetwork, ConnectionSummaryTop } from '@widgets/ConnectionSummary';
import { ProxyLatency } from '@widgets/ProxyLatency';

import type { OverviewRuntime } from '../lib';
import { OverviewActivity } from './OverviewActivity';
import { OverviewCoreGap } from './OverviewCoreGap';
import { OverviewSection } from './OverviewSection';

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
  // Until a current snapshot arrives the cards do not know whether there are connections: "none" would be a guess.
  const missing = runtime.connectionsGap !== null || runtime.connectionsAwaiting;

  return (
    <OverviewSection title={t('section.connections', { ns: 'shared' })}>
      {/* Six panels: two rows of three on a wide screen, three of two below it. */}
      <div className='grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3'>
        <ConnectionSummaryAction
          shares={runtime.summary.actions}
          placeholder={missing ? <OverviewCoreGap gap={runtime.connectionsGap} /> : undefined}
        />
        <OverviewActivity runtime={runtime} />
        <ConnectionSummaryNetwork
          shares={runtime.summary.networks}
          placeholder={missing ? <OverviewCoreGap gap={runtime.connectionsGap} /> : undefined}
        />
        <ConnectionSummaryTop
          title={t('connections.topNodes')}
          href='/proxies'
          shares={runtime.summary.nodes}
          empty={t('connections.topNodesEmpty')}
          placeholder={missing ? <OverviewCoreGap gap={runtime.connectionsGap} /> : undefined}
        />
        <ConnectionSummaryTop
          title={t('connections.topSources')}
          href='/connections'
          shares={runtime.summary.sources}
          label={sourceLabel}
          placeholder={missing ? <OverviewCoreGap gap={runtime.connectionsGap} /> : undefined}
        />
        <ProxyLatency
          onTested={onLatencyTested}
          placeholder={runtime.stopped ? <OverviewCoreGap gap={runtime.coreGap} /> : undefined}
        />
      </div>
    </OverviewSection>
  );
}
