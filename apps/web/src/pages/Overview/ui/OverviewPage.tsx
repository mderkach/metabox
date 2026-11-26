import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useConnectionStream } from '@entities/Connection';
import { useDaemonInstance, useRuntimeStream } from '@entities/Daemon';
import { useProxyLatency } from '@entities/Proxy';
import { SHARED_NS } from '@shared/i18n';
import { useNarrowScreen } from '@shared/lib/media';
import { useLiveRegion } from '@shared/lib/useLiveRegion';
import { LiveRegion } from '@shared/ui';
import { PageHeader } from '@widgets/PageHeader';

import { OVERVIEW_NS } from '../i18n/Overview.namespace.generated';
import { useOverviewRuntime, useOverviewVerdict } from '../lib';
import type { OverviewLinks } from '../model/Overview.links';
import { OverviewConnections } from './OverviewConnections';
import { OverviewDevice } from './OverviewDevice';
import { OverviewProcess } from './OverviewProcess';
import { OverviewStatus } from './OverviewStatus';
import { OverviewTraffic } from './OverviewTraffic';
import { OverviewVerdict } from './OverviewVerdict';

export function OverviewPage({ links }: { links: OverviewLinks }) {
  const { t } = useTranslation(OVERVIEW_NS);
  useConnectionStream();
  useRuntimeStream();

  const runtime = useOverviewRuntime();
  const daemon = useDaemonInstance();
  const latency = useProxyLatency(
    { daemon, pid: runtime.system?.singbox?.pid, startedAt: runtime.startedAt },
    !runtime.stopped
  );
  const verdict = useOverviewVerdict(runtime, latency.data?.servers, links);

  // A measurement changes numbers in place: visible to the eye, but for a screen reader
  // the result is announced by one region per screen.
  const { message, announce } = useLiveRegion();
  const narrow = useNarrowScreen();

  const onLatencyTested = useCallback(() => {
    announce(t('announce.latencyTested'));
  }, [announce, t]);

  return (
    <>
      <PageHeader title={t('section.overview', { ns: SHARED_NS })}>
        <OverviewVerdict verdict={verdict} />
      </PageHeader>

      <LiveRegion message={message} />

      <div className='flex min-h-0 grow flex-col gap-6 overflow-y-auto px-4 py-5 *:shrink-0 sm:px-6'>
        <OverviewStatus
          links={links}
          onAnnounce={announce}
          stopped={runtime.stopped}
          latencies={latency.data?.servers}
          latencyAvailable={latency.data?.available ?? !latency.isLoadingError}
        />
        <OverviewTraffic runtime={runtime} />
        <OverviewConnections links={links} runtime={runtime} latency={latency} onLatencyTested={onLatencyTested} />
        <OverviewDevice system={runtime.system} collapsible={narrow} />
        <OverviewProcess runtime={runtime} collapsible={narrow} />
      </div>
    </>
  );
}
