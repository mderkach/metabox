import { useTranslation } from 'react-i18next';

import { SCHEMA_VERSION, useConfigPath, useDaemonStatus, useTrafficHistory } from '@entities/Daemon';
import { DaemonRestart } from '@features/Daemon/DaemonControl';
import { DaemonModeSwitch } from '@features/Daemon/DaemonMode';
import { formatBytes } from '@shared/lib/format';
import { cn } from '@shared/lib/utils';
import { CARD_TITLE, Card, CardContent, CardHeader } from '@shared/ui';
import { DaemonService } from '@widgets/Daemon/DaemonService';

import { useDaemonMark, type OverviewRuntime } from '../lib';
import { OverviewProcessRow } from './OverviewProcessRow';
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
  const stepSeconds = history.data?.deviceStepSeconds ?? 0;

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
            <h3 className={CARD_TITLE}>{t('process.panel')}</h3>
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
              <OverviewProcessRow
                label={t('daemon.name', { ns: 'shared' })}
                value={status.isPending ? null : (status.data?.version ?? '—')}
                mono
              />
              <OverviewProcessRow label={t('process.schema')} value={SCHEMA_VERSION} mono />
              <OverviewProcessRow label={t('process.config')} value={configPath} mono />
              <div className='flex items-center justify-between gap-4 border-t border-border py-1 text-sm'>
                <dt className='text-muted-foreground'>{t('clashMode.label', { ns: 'shared' })}</dt>
                <dd className='min-w-0'>
                  <DaemonModeSwitch />
                </dd>
              </div>
              {system !== null && (
                <OverviewProcessRow
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
