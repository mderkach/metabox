import { useTranslation } from 'react-i18next';

import { SCHEMA_VERSION, useConfigPath, useDaemonStatus, useTrafficHistory } from '@entities/Daemon';
import { DaemonRestart } from '@features/Daemon/DaemonControl';
import { DaemonModeSwitch } from '@features/Daemon/DaemonMode';
import { formatBytes } from '@shared/lib/format';
import { cn } from '@shared/lib/utils';
import { Card, CardContent, CardHeader, PENDING_REVEAL, SECTION_LABEL, Skeleton } from '@shared/ui';
import { DaemonService } from '@widgets/Daemon/DaemonService';

import { useDaemonMark, type OverviewRuntime } from '../lib';
import { OverviewSection } from './OverviewSection';
import { OverviewTrend } from './OverviewTrend';

/**
 * Processes and their readings.
 *
 * Daemon memory, goroutine count and Go heap stay on screen on purpose: the router
 * is low-powered, and how much the panel itself consumes is a question for the device owner, not
 * only for debugging.
 */
export function OverviewProcess({ runtime, collapsible }: { runtime: OverviewRuntime; collapsible: boolean }) {
  const { t } = useTranslation('pages/Overview');
  const status = useDaemonStatus();
  const daemon = useDaemonMark(status.isSuccess);
  const configPath = useConfigPath();
  const system = runtime.system;
  const history = useTrafficHistory();
  const points = history.data?.device ?? [];
  const stepSeconds = history.data?.stepSeconds ?? 0;

  return (
    <OverviewSection title={t('process.title')} collapsible={collapsible}>
      <div className='grid items-start gap-4 xl:grid-cols-2'>
        <DaemonService
          process={system?.singbox}
          heap={runtime.memory}
          memoryTrend={
            <OverviewTrend
              samples={points.map((point) => point.singbox)}
              stepSeconds={stepSeconds}
              format={formatBytes}
              label={t('process.singboxHistory')}
            />
          }
        />

        <Card>
          <CardHeader className='flex flex-row flex-wrap items-center gap-x-2.5 gap-y-1'>
            <h3 className={SECTION_LABEL}>{t('process.panel')}</h3>
            <p className='flex items-center gap-1.5 text-xs'>
              <span aria-hidden='true' className={cn('size-2 shrink-0 rounded-full', daemon.tone)} />
              {daemon.label}
            </p>
            <p className='flex items-center gap-1.5 text-xs'>
              <span
                aria-hidden='true'
                className={cn('size-2 shrink-0 rounded-full', runtime.live ? 'bg-signal-ok' : 'bg-signal-warn')}
              />
              {runtime.live ? t('process.streamUp') : t('process.streamDown')}
            </p>
            <span className='grow' />
            <DaemonRestart />
          </CardHeader>

          <CardContent>
            <dl>
              <ProcessRow
                label={t('daemon.name', { ns: 'shared' })}
                value={status.isPending ? null : (status.data?.version ?? '—')}
                mono
              />
              <ProcessRow label={t('process.schema')} value={SCHEMA_VERSION} mono />
              <ProcessRow label={t('process.config')} value={configPath} mono />
              <div className='flex items-center justify-between gap-4 border-t border-border py-1 text-sm'>
                <dt className='text-muted-foreground'>{t('clashMode.label', { ns: 'shared' })}</dt>
                <dd className='min-w-0'>
                  <DaemonModeSwitch />
                </dd>
              </div>
              {system !== null && (
                <ProcessRow
                  label={t('process.memory')}
                  value={`${formatBytes(system.daemon.rss)} · ${t('count.goroutine', {
                    ns: 'shared',
                    count: system.daemon.goroutines,
                  })}`}
                />
              )}
            </dl>
            <OverviewTrend
              samples={points.map((point) => point.daemon)}
              stepSeconds={stepSeconds}
              format={formatBytes}
              label={t('process.daemonHistory')}
            />
          </CardContent>
        </Card>
      </div>
    </OverviewSection>
  );
}

/** `null` instead of a value means no answer yet: a skeleton, not a dash. */
function ProcessRow({ label, value, mono = false }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className='flex justify-between gap-4 border-t border-border py-2 text-sm first:border-t-0'>
      <dt className='text-muted-foreground'>{label}</dt>
      <dd className={cn('min-w-0 truncate', mono && 'font-mono text-xs')}>
        {value ?? <Skeleton aria-hidden='true' className={cn('h-4 w-24', PENDING_REVEAL)} />}
      </dd>
    </div>
  );
}
