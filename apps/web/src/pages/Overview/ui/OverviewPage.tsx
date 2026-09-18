import { useTranslation } from 'react-i18next';

import { useConnectionStream } from '@entities/Connection';
import { useRuntimeStream } from '@entities/Daemon';
import { cn } from '@shared/lib/utils';

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
      <header className='flex min-h-14 shrink-0 flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border px-4 py-3 sm:px-6'>
        <h1 className='text-2xl font-semibold'>{t('title')}</h1>
        <p className='flex items-center gap-2 text-sm text-muted-foreground'>
          <span className={cn('size-2 shrink-0 rounded-full', VERDICT_DOT[verdict.tone])} aria-hidden='true' />
          {verdict.text}
        </p>
      </header>

      <div className='flex min-h-0 grow flex-col gap-6 overflow-y-auto px-4 py-5 *:shrink-0 sm:px-6'>
        <OverviewTraffic runtime={runtime} />
        <OverviewConnections runtime={runtime} />
        <OverviewDevice system={runtime.system} />
        <OverviewProcess runtime={runtime} />
      </div>
    </>
  );
}
