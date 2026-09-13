import type { ReactNode } from 'react';

import { useConnectionStream } from '@entities/Connection';
import { SCHEMA_VERSION, useClashConfigs, useConfigPath, useDaemonStatus, useRuntimeStream } from '@entities/Daemon';
import { formatAge, formatBytes, formatRate, plural } from '@shared/lib/format';
import { SECTION_HEADING, SECTION_LABEL } from '@shared/lib/styles';
import { cn } from '@shared/lib/utils';
import { Card, CardContent, CardHeader } from '@shared/ui';
import { ConnectionHistory } from '@widgets/ConnectionHistory';
import {
  ConnectionSummaryNetwork,
  ConnectionSummaryOutcome,
  ConnectionSummaryTop,
  ConnectionSummaryVolume,
} from '@widgets/ConnectionSummary';
import { DaemonService } from '@widgets/Daemon/DaemonService';
import { DaemonHistory, DaemonMemory, DaemonTraffic } from '@widgets/Daemon/DaemonTraffic';
import { ProxyLatency } from '@widgets/ProxyLatency';

import { useOverviewRuntime, useOverviewVerdict, VERDICT_TONE, type VerdictTone } from '../lib';

const GOROUTINE_FORMS = ['горутина', 'горутины', 'горутин'] as const;
const CORE_FORMS = ['ядра', 'ядер', 'ядер'] as const;

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
  useConnectionStream();
  useRuntimeStream();

  const runtime = useOverviewRuntime();
  const verdict = useOverviewVerdict(runtime.system, runtime.live, runtime.awaiting);
  const status = useDaemonStatus();
  const configPath = useConfigPath();
  const clash = useClashConfigs();

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
        <h1 className='text-2xl font-semibold'>Обзор</h1>
        <p className='flex items-center gap-2 text-sm text-muted-foreground'>
          <span className={cn('size-2 shrink-0 rounded-full', VERDICT_DOT[verdict.tone])} aria-hidden='true' />
          {verdict.text}
        </p>
      </header>

      <div className='flex min-h-0 grow flex-col gap-6 overflow-y-auto px-4 py-5 *:shrink-0 sm:px-6'>
        <Section
          title='Трафик'
          note={system?.uplink === undefined ? undefined : `${system.uplink.name} · ${formatRate(linkRate)} сейчас`}
        >
          <div className='grid items-start gap-4 xl:grid-cols-[minmax(0,2.6fr)_minmax(0,1fr)]'>
            <Card className='gap-0 py-0'>
              <div className='flex flex-col xl:flex-row'>
                <ul aria-label='Скорость' className='grid min-w-0 grow grid-cols-1 gap-px bg-border sm:grid-cols-2'>
                  <Tile
                    label='Через sing-box'
                    value={runtime.share.proxy > 0 ? formatBytes(runtime.share.proxy) : '—'}
                    context={
                      runtime.share.link > 0
                        ? `${String(Math.round(proxyShare * PERCENT))}% от канала`
                        : 'канал ещё не мерился'
                    }
                    meter={runtime.share.link > 0 ? proxyShare : undefined}
                  />
                  <Tile
                    label='Канал наружу'
                    value={runtime.share.link > 0 ? formatBytes(runtime.share.link) : '—'}
                    context={
                      runtime.share.seconds > 0 ? `за ${formatAge(runtime.share.seconds)} работы демона` : 'ждём снимок'
                    }
                  />
                  <Tile
                    label='Входящий'
                    value={formatRate(runtime.now.down)}
                    tone='text-series-down'
                    context={
                      runtime.peakDown > 0 ? `пик за минуту ${formatRate(runtime.peakDown)}` : 'пика ещё не было'
                    }
                  />
                  <Tile
                    label='Исходящий'
                    value={formatRate(runtime.now.up)}
                    tone='text-series-up'
                    context={runtime.peakUp > 0 ? `пик за минуту ${formatRate(runtime.peakUp)}` : 'пика ещё не было'}
                  />
                </ul>

                <div className='min-w-0 border-t border-border px-4 py-4 xl:w-1/2 xl:border-t-0 xl:border-l'>
                  <DaemonTraffic samples={runtime.traffic} />
                </div>
              </div>
            </Card>

            <ConnectionSummaryVolume totals={runtime.totals} />
          </div>

          <DaemonHistory />
        </Section>

        <Section title='Соединения' note='сводку считает панель'>
          <div className='grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3'>
            <Card className='gap-0 py-0'>
              <ul aria-label='Счётчики соединений' className='grid grid-cols-2 gap-px bg-border'>
                <Tile
                  label='Открыто'
                  value={String(runtime.counts.active)}
                  context={`пик за минуту ${String(Math.max(...runtime.history, runtime.counts.active))}`}
                />
                <Tile
                  label='Закрыто'
                  value={String(runtime.counts.closed)}
                  context={runtime.counts.closed > 0 ? 'держит панель' : 'пока ни одного'}
                />
              </ul>
            </Card>

            <ConnectionHistory samples={runtime.history} />
            <ConnectionSummaryOutcome shares={runtime.summary.outcomes} />
            <ConnectionSummaryNetwork shares={runtime.summary.networks} />
          </div>

          <div className='grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3'>
            <ConnectionSummaryTop
              title='Топ узлов прокси'
              href='/proxies'
              shares={runtime.summary.nodes}
              empty='Через прокси сейчас никто не идёт'
            />
            <ConnectionSummaryTop
              title='Топ устройств'
              href='/connections'
              shares={runtime.summary.sources}
              empty='Живых соединений нет'
            />
            <ProxyLatency />
          </div>
        </Section>

        <Section title='Роутер'>
          <Card className='gap-0 py-0'>
            <ul
              aria-label='Показания устройства'
              className='grid grid-cols-1 gap-px bg-border sm:grid-cols-2 lg:grid-cols-4'
            >
              <Tile
                label='Загрузка'
                value={system === null ? '—' : system.load.one.toFixed(LOAD_PRECISION)}
                context={system === null ? 'ждём снимок' : `из ${plural(system.load.cores, CORE_FORMS)}`}
                meter={system === null ? undefined : system.load.one / system.load.cores}
              />
              <Tile
                label='Температура'
                value={hottest === undefined ? '—' : `${hottest.celsius.toFixed(DEGREE_PRECISION)} °C`}
                context={hottest === undefined ? 'зон нет' : hottest.name}
              />
              <Tile
                label='Память платы'
                value={system === null ? '—' : formatBytes(usedMemory)}
                context={system === null ? 'ждём снимок' : `из ${formatBytes(system.memory.total)}`}
                meter={system === null ? undefined : usedMemory / system.memory.total}
              />
              <Tile
                label='Аптайм'
                value={system === null ? '—' : formatAge(system.uptime)}
                context={system === null ? 'ждём снимок' : 'с последней загрузки'}
              />
            </ul>
          </Card>
        </Section>

        <Section title='Процессы'>
          <div className='grid items-start gap-4 xl:grid-cols-2'>
            <DaemonService
              process={system?.singbox}
              heap={runtime.memory}
              heapChart={<DaemonMemory samples={runtime.memoryHistory} />}
            />

            <Card>
              <CardHeader className='flex flex-row flex-wrap items-center gap-x-2.5 gap-y-1'>
                <h3 className={SECTION_LABEL}>Панель</h3>
                <p className='flex items-center gap-1.5 text-xs'>
                  <span
                    aria-hidden='true'
                    className={cn('size-2 shrink-0 rounded-full', status.isSuccess ? 'bg-signal-ok' : 'bg-signal-bad')}
                  />
                  {status.isSuccess ? 'демон отвечает' : 'демон не отвечает'}
                </p>
                <p className='flex items-center gap-1.5 text-xs'>
                  <span
                    aria-hidden='true'
                    className={cn('size-2 shrink-0 rounded-full', runtime.live ? 'bg-signal-ok' : 'bg-signal-warn')}
                  />
                  {runtime.live ? 'поток идёт' : 'поток молчит'}
                </p>
              </CardHeader>

              <CardContent>
                <dl>
                  <Row label='Демон' value={status.data?.version ?? '—'} mono />
                  <Row label='Схема форм' value={SCHEMA_VERSION} mono />
                  <Row label='Конфиг' value={configPath} mono />
                  <Row label='Режим Clash API' value={clash.data?.mode ?? '—'} />
                  {system !== null && (
                    <Row
                      label='Память демона'
                      value={`${formatBytes(system.daemon.rss)} · ${plural(system.daemon.goroutines, GOROUTINE_FORMS)}`}
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
}: {
  label: string;
  value: string;
  context: string;
  tone?: string;
  meter?: number;
}) {
  return (
    <li className='flex flex-col gap-1 bg-card px-4 py-3.5'>
      <dl className='flex flex-col gap-0.5'>
        <dt className='text-xs text-muted-foreground'>{label}</dt>
        <dd className={cn('text-xl font-semibold tabular-nums', tone)}>{value}</dd>
      </dl>
      <p className='text-xs text-muted-foreground'>{context}</p>
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
