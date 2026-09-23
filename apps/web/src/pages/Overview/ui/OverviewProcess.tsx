import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { SCHEMA_VERSION, useClashConfigs, useConfigPath, useDaemonStatus } from '@entities/Daemon';
import { toClashModeLabel } from '@features/Daemon/DaemonMode';
import { formatBytes } from '@shared/lib/format';
import { cn } from '@shared/lib/utils';
import { Card, CardContent, CardHeader, PENDING_REVEAL, SECTION_LABEL, Skeleton } from '@shared/ui';
import { DaemonService } from '@widgets/Daemon/DaemonService';
import { DaemonMemory } from '@widgets/Daemon/DaemonTraffic';

import type { OverviewRuntime } from '../lib';
import { OverviewSection } from './OverviewSection';

/**
 * Процессы и их показания.
 *
 * Память демона, число горутин и куча Go остаются на экране намеренно: роутер
 * маломощный, и сколько съедает сама панель — вопрос владельца устройства, а не
 * только отладки.
 */
export function OverviewProcess({ runtime }: { runtime: OverviewRuntime }) {
  const { t } = useTranslation('pages/Overview');
  const status = useDaemonStatus();
  const configPath = useConfigPath();
  const clash = useClashConfigs();
  const { t: tShared } = useTranslation('shared');
  const system = runtime.system;

  return (
    <OverviewSection title={t('process.title')}>
      <div className='grid items-start gap-4 xl:grid-cols-2'>
        <DaemonService
          process={system?.singbox}
          heap={runtime.memory}
          heapChart={<DaemonMemory samples={runtime.memoryHistory} />}
        />

        <Card>
          <CardHeader className='flex flex-row flex-wrap items-center gap-x-2.5 gap-y-1'>
            <h3 className={SECTION_LABEL}>{t('process.panel')}</h3>
            <p className='flex items-center gap-1.5 text-xs'>
              <span
                aria-hidden='true'
                className={cn('size-2 shrink-0 rounded-full', status.isSuccess ? 'bg-signal-ok' : 'bg-signal-bad')}
              />
              {status.isSuccess ? t('process.daemonUp') : t('daemon.silent', { ns: 'shared' })}
            </p>
            <p className='flex items-center gap-1.5 text-xs'>
              <span
                aria-hidden='true'
                className={cn('size-2 shrink-0 rounded-full', runtime.live ? 'bg-signal-ok' : 'bg-signal-warn')}
              />
              {runtime.live ? t('process.streamUp') : t('process.streamDown')}
            </p>
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
              <ProcessRow label={t('process.clashMode')} value={toClashMode(tShared, clash)} />
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
          </CardContent>
        </Card>
      </div>
    </OverviewSection>
  );
}

/** `null` — ответа ещё нет; прочерк — режим не прочитан. */
function toClashMode(t: TFunction<'shared'>, clash: ReturnType<typeof useClashConfigs>): string | null {
  if (clash.isPending) {
    return null;
  }

  return clash.data === undefined ? '—' : toClashModeLabel(t, clash.data.mode);
}

/** `null` вместо значения — ответа ещё нет: скелетон, а не прочерк. */
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
