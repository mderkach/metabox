import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { deviceLabel, useDeviceIndex } from '@entities/Device';
import type { useProxyLatency } from '@entities/Proxy';
import { SHARED_NS } from '@shared/i18n';
import { ConnectionSummaryAction, ConnectionSummaryNetwork, ConnectionSummaryTop } from '@widgets/ConnectionSummary';
import { ProxyLatency } from '@widgets/ProxyLatency';

import { OVERVIEW_NS } from '../i18n/Overview.namespace.generated';
import type { OverviewRuntime } from '../lib';
import type { OverviewLinks } from '../model/Overview.links';
import { OverviewActivity } from './OverviewActivity';
import { OverviewCoreGap } from './OverviewCoreGap';
import { OverviewSection } from './OverviewSection';

export function OverviewConnections({
  links,
  runtime,
  latency,
  onLatencyTested,
}: {
  links: Pick<OverviewLinks, 'proxies' | 'connections'>;
  runtime: OverviewRuntime;
  latency: ReturnType<typeof useProxyLatency>;
  onLatencyTested: () => void;
}) {
  const { t } = useTranslation(OVERVIEW_NS);
  // The overview is kept open for hours: a new device on the network should get a name
  // without a reload, so the device list is polled here.
  const devices = useDeviceIndex({ poll: true });
  const sourceLabel = useCallback((ip: string) => deviceLabel(ip, devices), [devices]);
  // Until a current snapshot arrives the cards do not know whether there are connections: "none" would be a guess.
  const missing = runtime.connectionsGap !== null || runtime.connectionsAwaiting;

  return (
    <OverviewSection title={t('section.connections', { ns: SHARED_NS })}>
      <div className='grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3'>
        <ConnectionSummaryAction
          shares={runtime.summary.actions}
          placeholder={missing ? <OverviewCoreGap gap={runtime.connectionsGap} /> : undefined}
        />
        <OverviewActivity connectionsTo={links.connections} runtime={runtime} />
        <ConnectionSummaryNetwork
          shares={runtime.summary.networks}
          placeholder={missing ? <OverviewCoreGap gap={runtime.connectionsGap} /> : undefined}
        />
        <ConnectionSummaryTop
          title={t('connections.topNodes')}
          href={links.proxies}
          shares={runtime.summary.nodes}
          empty={t('connections.topNodesEmpty')}
          placeholder={missing ? <OverviewCoreGap gap={runtime.connectionsGap} /> : undefined}
        />
        <ConnectionSummaryTop
          title={t('connections.topSources')}
          href={links.connections}
          shares={runtime.summary.sources}
          label={sourceLabel}
          placeholder={missing ? <OverviewCoreGap gap={runtime.connectionsGap} /> : undefined}
        />
        <ProxyLatency
          latency={latency}
          onTested={onLatencyTested}
          placeholder={runtime.stopped ? <OverviewCoreGap gap={runtime.coreGap} /> : undefined}
        />
      </div>
    </OverviewSection>
  );
}
