import { useTranslation } from 'react-i18next';

import { useConnectionStream } from '@entities/Connection';
import { useRuntimeStream } from '@entities/Daemon';
import { cn } from '@shared/lib/utils';
import { PageHeader } from '@widgets/PageHeader';

import { useOverviewRuntime, useOverviewVerdict, VERDICT_TONE, type VerdictTone } from '../lib';
import { OverviewConnections } from './OverviewConnections';
import { OverviewDevice } from './OverviewDevice';
import { OverviewProcess } from './OverviewProcess';
import { OverviewTraffic } from './OverviewTraffic';

const VERDICT_DOT: Readonly<Record<VerdictTone, string>> = {
  [VERDICT_TONE.Ok]: 'bg-signal-ok',
  [VERDICT_TONE.Warn]: 'bg-signal-warn',
  [VERDICT_TONE.Bad]: 'bg-signal-bad',
};

export function OverviewPage() {
  const { t } = useTranslation('pages/Overview');
  useConnectionStream();
  useRuntimeStream();

  const runtime = useOverviewRuntime();
  const verdict = useOverviewVerdict(runtime.system, runtime.live, runtime.awaiting);

  return (
    <>
      <PageHeader title={t('section.overview', { ns: 'shared' })}>
        <p className='flex items-center gap-2 text-sm text-muted-foreground'>
          <span className={cn('size-2 shrink-0 rounded-full', VERDICT_DOT[verdict.tone])} aria-hidden='true' />
          {verdict.text}
        </p>
      </PageHeader>

      <div className='flex min-h-0 grow flex-col gap-6 overflow-y-auto px-4 py-5 *:shrink-0 sm:px-6'>
        <OverviewTraffic runtime={runtime} />
        <OverviewConnections runtime={runtime} />
        <OverviewDevice system={runtime.system} />
        <OverviewProcess runtime={runtime} />
      </div>
    </>
  );
}
