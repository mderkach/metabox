import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useConnectionStream } from '@entities/Connection';
import { useRuntimeStream } from '@entities/Daemon';
import { useLiveRegion } from '@shared/lib/useLiveRegion';
import { LiveRegion } from '@shared/ui';
import { PageHeader } from '@widgets/PageHeader';

import { useOverviewRuntime, useOverviewVerdict } from '../lib';
import { OverviewConnections } from './OverviewConnections';
import { OverviewDevice } from './OverviewDevice';
import { OverviewProcess } from './OverviewProcess';
import { OverviewTraffic } from './OverviewTraffic';
import { OverviewVerdict } from './OverviewVerdict';

export function OverviewPage() {
  const { t } = useTranslation('pages/Overview');
  useConnectionStream();
  useRuntimeStream();

  const runtime = useOverviewRuntime();
  const verdict = useOverviewVerdict(runtime);

  // Замер меняет числа на месте: глазами это видно, а скринридеру результат
  // объявляет одна область на экран.
  const { message, announce } = useLiveRegion();

  const onLatencyTested = useCallback(() => {
    announce(t('announce.latencyTested'));
  }, [announce, t]);

  return (
    <>
      <PageHeader title={t('section.overview', { ns: 'shared' })}>
        <OverviewVerdict verdict={verdict} />
      </PageHeader>

      <LiveRegion message={message} />

      <div className='flex min-h-0 grow flex-col gap-6 overflow-y-auto px-4 py-5 *:shrink-0 sm:px-6'>
        <OverviewTraffic runtime={runtime} />
        <OverviewConnections runtime={runtime} onLatencyTested={onLatencyTested} />
        <OverviewDevice system={runtime.system} />
        <OverviewProcess runtime={runtime} />
      </div>
    </>
  );
}
