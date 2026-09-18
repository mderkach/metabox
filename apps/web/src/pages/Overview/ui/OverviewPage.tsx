import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useConnectionStream } from '@entities/Connection';
import {
  SCHEMA_VERSION,
  useClashConfigs,
  useConfigPath,
  useDaemonStatus,
  useRuntimeStream,
  useTrafficHistory,
} from '@entities/Daemon';
import { formatAge, formatBytes, formatRate } from '@shared/lib/format';
import { SECTION_HEADING, SECTION_LABEL } from '@shared/lib/styles';
import { cn } from '@shared/lib/utils';
import { Card, CardContent, CardHeader } from '@shared/ui';
import { ConnectionHistory } from '@widgets/ConnectionHistory';
import {
  ConnectionSummaryNetwork,
  ConnectionSummaryAction,
  ConnectionSummaryTop,
  ConnectionSummaryVolume,
} from '@widgets/ConnectionSummary';
import { DaemonService } from '@widgets/Daemon/DaemonService';
import { DaemonMemory, DaemonSparkline, DaemonTraffic } from '@widgets/Daemon/DaemonTraffic';
import { ProxyLatency } from '@widgets/ProxyLatency';

import { useOverviewRuntime, useOverviewVerdict, VERDICT_TONE, type VerdictTone } from '../lib';

const PERCENT = 100;
const DEGREE_PRECISION = 1;
/** Загрузка печатается сотыми: десятых мало, чтобы отличить простой от работы. */
const LOAD_PRECISION = 2;

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
  const status = useDaemonStatus();
  const configPath = useConfigPath();
  const clash = useClashConfigs();
  const history = useTrafficHistory();
  const deviceHistory = history.data?.device ?? [];

  const system = runtime.system;
  const linkRate = runtime.uplink.rx + runtime.uplink.tx;
  // Инкапсуляция прокси добавляет байт поверх исходного трафика, поэтому доля
  // упирается в сотню.
  const proxyShare = Math.min(1, runtime.share.link > 0 ? runtime.share.proxy / runtime.share.link : 0);
  // Зон у платы может не быть вовсе, поэтому берётся первая из отсортированных
  // только на непустом списке.
  const zones = system === null ? [] : system.thermal.toSorted((left, right) => right.celsius - left.celsius);
  const hottest = zones.length > 0 ? zones[0] : undefined;
  const usedMemory = system === null ? 0 : system.memory.total - system.memory.available;

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
        <Section
          title={t('traffic.title')}
          note={
            system?.uplink === undefined
              ? undefined
              : t('traffic.note', { link: system.uplink.name, rate: formatRate(linkRate) })
          }
        >
          <div className='grid items-start gap-4 xl:grid-cols-[minmax(0,2.6fr)_minmax(0,1fr)]'>
            <Card className='gap-0 py-0'>
              <div className='flex flex-col xl:flex-row'>
                <ul
                  aria-label={t('traffic.label')}
                  className='grid min-w-0 grow grid-cols-1 gap-px bg-border sm:grid-cols-2'
                >
                  <Tile
                    label={t('traffic.proxy')}
                    value={runtime.share.proxy > 0 ? formatBytes(runtime.share.proxy) : '—'}
                    context={
                      runtime.share.link > 0
                        ? t('traffic.proxyShare', { percent: Math.round(proxyShare * PERCENT) })
                        : t('traffic.proxyUnknown')
                    }
                    meter={runtime.share.link > 0 ? proxyShare : undefined}
                  />
                  <Tile
                    label={t('traffic.uplink')}
                    value={runtime.share.link > 0 ? formatBytes(runtime.share.link) : '—'}
                    context={
                      runtime.share.seconds > 0
                        ? t('traffic.uplinkSince', { age: formatAge(runtime.share.seconds) })
                        : t('device.waiting')
                    }
                  />
                  <Tile
                    label={t('traffic.down')}
                    value={formatRate(runtime.now.down)}
                    tone='text-series-down'
                    context={
                      runtime.peakDown > 0
                        ? t('traffic.peak', { value: formatRate(runtime.peakDown) })
                        : t('traffic.noPeak')
                    }
                  />
                  <Tile
                    label={t('traffic.up')}
                    value={formatRate(runtime.now.up)}
                    tone='text-series-up'
                    context={
                      runtime.peakUp > 0
                        ? t('traffic.peak', { value: formatRate(runtime.peakUp) })
                        : t('traffic.noPeak')
                    }
                  />
                </ul>

                <div className='min-w-0 border-t border-border px-4 py-4 xl:w-1/2 xl:border-t-0 xl:border-l'>
                  <DaemonTraffic samples={runtime.traffic} />
                </div>
              </div>
            </Card>

            <ConnectionSummaryVolume totals={runtime.totals} />
          </div>
        </Section>

        <Section title={t('connections.title')} note={t('connections.note')}>
          <div className='grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3'>
            <Card className='gap-0 py-0'>
              <ul aria-label={t('connections.label')} className='grid grid-cols-2 gap-px bg-border'>
                <Tile
                  label={t('connections.open')}
                  value={String(runtime.counts.active)}
                  context={t('connections.peak', { count: Math.max(...runtime.history, runtime.counts.active) })}
                />
                <Tile
                  label={t('connections.closed')}
                  value={String(runtime.counts.closed)}
                  context={runtime.counts.closed > 0 ? t('connections.keptByPanel') : t('connections.none')}
                />
              </ul>
            </Card>

            <ConnectionHistory samples={runtime.history} />
            <ConnectionSummaryAction shares={runtime.summary.actions} />
            <ConnectionSummaryNetwork shares={runtime.summary.networks} />
          </div>

          <div className='grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3'>
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
              empty={t('connections.topSourcesEmpty')}
            />
            <ProxyLatency />
          </div>
        </Section>

        <Section title={t('device.title')}>
          <Card className='gap-0 py-0'>
            <ul
              aria-label={t('device.label')}
              className='grid grid-cols-1 gap-px bg-border sm:grid-cols-2 lg:grid-cols-4'
            >
              <Tile
                label={t('device.load')}
                value={system === null ? '—' : system.load.one.toFixed(LOAD_PRECISION)}
                context={
                  system === null
                    ? t('device.waiting')
                    : t('device.ofCores', { cores: t('count.core', { ns: 'shared', count: system.load.cores }) })
                }
                chart={
                  <DaemonSparkline samples={deviceHistory.map((point) => point.load)} label={t('device.loadHistory')} />
                }
              />
              <Tile
                label={t('device.temperature')}
                value={hottest === undefined ? '—' : `${hottest.celsius.toFixed(DEGREE_PRECISION)} °C`}
                context={hottest === undefined ? t('device.noZones') : hottest.name}
                chart={
                  <DaemonSparkline
                    samples={deviceHistory.map((point) => point.celsius)}
                    label={t('device.temperatureHistory')}
                    tone='text-signal-warn'
                  />
                }
              />
              <Tile
                label={t('device.memory')}
                value={system === null ? '—' : formatBytes(usedMemory)}
                context={
                  system === null
                    ? t('device.waiting')
                    : t('device.ofTotal', { total: formatBytes(system.memory.total) })
                }
                chart={
                  <DaemonSparkline
                    samples={deviceHistory.map((point) => point.memory)}
                    label={t('device.memoryHistory')}
                  />
                }
              />
              <Tile
                label={t('device.uptime')}
                value={system === null ? '—' : formatAge(system.uptime)}
                context={system === null ? t('device.waiting') : t('device.sinceBoot')}
              />
            </ul>
          </Card>
        </Section>

        <Section title={t('process.title')}>
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
                  {status.isSuccess ? t('process.daemonUp') : t('process.daemonDown')}
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
                  <Row label={t('process.daemon')} value={status.data?.version ?? '—'} mono />
                  <Row label={t('process.schema')} value={SCHEMA_VERSION} mono />
                  <Row label={t('process.config')} value={configPath} mono />
                  <Row label={t('process.clashMode')} value={clash.data?.mode ?? '—'} />
                  {system !== null && (
                    <Row
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
        </Section>
      </div>
    </>
  );
}

function Section({
  title,
  count,
  note,
  children,
}: {
  title: string;
  /** Главное число секции: стоит в заголовке, чтобы не занимать отдельную плитку. */
  count?: string;
  /** Правая подпись: происхождение данных или общий для секции контекст. */
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className='flex flex-col gap-3'>
      <div className='flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-muted-foreground'>
        <h2 className={cn(SECTION_HEADING, 'text-foreground')}>{title}</h2>
        {count !== undefined && <p>{count}</p>}
        {note !== undefined && (
          <p>
            <span aria-hidden='true'>· </span>
            {note}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

/** Полоса рисуется только у величины с потолком: без него шкала не задана. */
function Tile({
  label,
  value,
  context,
  tone,
  meter,
  chart,
}: {
  label: string;
  value: string;
  context: string;
  tone?: string;
  meter?: number;
  /** Ряд под числом: динамика там, где у величины нет потолка. */
  chart?: ReactNode;
}) {
  return (
    <li className='flex flex-col gap-1 bg-card px-4 py-3.5'>
      <dl className='flex flex-col gap-0.5'>
        <dt className='text-xs text-muted-foreground'>{label}</dt>
        <dd className={cn('text-xl font-semibold tabular-nums', tone)}>{value}</dd>
      </dl>
      <div className='flex items-end justify-between gap-2'>
        <p className='text-xs text-muted-foreground'>{context}</p>
        {chart}
      </div>
      {meter !== undefined && (
        <span className='block h-1 overflow-hidden rounded-full bg-meter-track'>
          <span
            className='block h-full rounded-full bg-primary'
            style={{ width: `${String(Math.min(1, meter) * PERCENT)}%` }}
          />
        </span>
      )}
    </li>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className='flex justify-between gap-4 border-t border-border py-2 text-sm first:border-t-0'>
      <dt className='text-muted-foreground'>{label}</dt>
      <dd className={cn('min-w-0 truncate', mono && 'font-mono text-xs')}>{value}</dd>
    </div>
  );
}
