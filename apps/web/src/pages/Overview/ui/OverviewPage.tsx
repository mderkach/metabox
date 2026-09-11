import type { ReactNode } from 'react';

import { ConnectionState, useConnectionCounts, useConnectionStream } from '@entities/Connection';
import {
  RuntimeState,
  useClashConfigs,
  useConfigPath,
  useDaemonStatus,
  useRuntimeStream,
  useTrafficNow,
} from '@entities/Daemon';
import { formatBytes, formatRate } from '@shared/lib/format';
import { Badge, Card, CardContent, CardHeader } from '@shared/ui';
import { DaemonService } from '@widgets/Daemon/DaemonService';
import { DaemonMemory, DaemonTraffic } from '@widgets/Daemon/DaemonTraffic';

export function OverviewPage() {
  useConnectionStream();
  useRuntimeStream();

  const status = useDaemonStatus();
  const configPath = useConfigPath();
  const clash = useClashConfigs();
  const traffic = RuntimeState.use.traffic();
  const now = useTrafficNow();
  const memory = RuntimeState.use.memoryNow();
  const memoryHistory = RuntimeState.use.memory();
  const totals = ConnectionState.use.totals();
  const counts = useConnectionCounts();

  return (
    <>
      <header className='flex min-h-14 shrink-0 flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b border-border px-4 py-2.5 sm:px-6'>
        <h1 className='text-base font-medium'>Обзор</h1>
        <p className='text-xs text-muted-foreground'>данные рантайма, конфиг не меняется</p>
      </header>

      <div className='flex min-h-0 grow flex-col gap-4 overflow-y-auto px-4 py-5 *:shrink-0 sm:px-6'>
        <ul aria-label='Показатели рантайма' className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
          <Tile label='Входящий' value={formatRate(now.down)} />
          <Tile label='Исходящий' value={formatRate(now.up)} />
          <Tile label='Активных соединений' value={String(counts.active)} />
          {/* Первый сэмпл потока нулевой: до второго честнее прочерк, чем «0 Б». */}
          <Tile
            label='Память sing-box'
            value={memory > 0 ? formatBytes(memory) : '—'}
            chart={<DaemonMemory samples={memoryHistory} />}
          />
        </ul>

        <Card>
          <CardHeader className='flex flex-row items-baseline justify-between'>
            <h2 className='text-sm font-medium'>Трафик за минуту</h2>
            <p className='flex gap-4 text-xs text-muted-foreground'>
              <span className='flex items-center gap-1.5'>
                <span className='h-0.5 w-3 bg-foreground' aria-hidden='true' />
                входящий
              </span>
              <span className='flex items-center gap-1.5'>
                <span className='h-0.5 w-3 bg-muted-foreground' aria-hidden='true' />
                исходящий
              </span>
            </p>
          </CardHeader>

          <CardContent className='flex flex-col gap-3'>
            <DaemonTraffic samples={traffic} />

            <dl className='flex gap-6 border-t border-border pt-3 text-sm'>
              <Total label='Всего получено' value={formatBytes(totals.download)} />
              <Total label='Всего отдано' value={formatBytes(totals.upload)} />
            </dl>
          </CardContent>
        </Card>

        <DaemonService />

        <Card>
          <CardHeader className='flex flex-row items-center gap-2.5'>
            <h2 className='text-sm font-medium'>Состояние панели</h2>
            <Badge variant={status.isSuccess ? 'secondary' : 'destructive'}>
              {status.isSuccess ? 'демон отвечает' : 'демон не отвечает'}
            </Badge>
          </CardHeader>

          <CardContent>
            <dl>
              <Row label='Бинарь' value={status.data?.version ?? '—'} mono />
              <Row label='Конфиг' value={configPath} mono />
              <Row label='Режим Clash API' value={clash.data?.mode ?? '—'} />
              <Row label='Соединений закрыто панелью' value={String(counts.closed)} />
            </dl>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Tile({ label, value, chart }: { label: string; value: string; chart?: ReactNode }) {
  return (
    <li>
      <Card size='sm' className='gap-0.5 px-3.5 py-3'>
        <dl>
          <dt className='text-xs text-muted-foreground'>{label}</dt>
          <dd className='text-2xl font-medium tracking-tight tabular-nums'>{value}</dd>
        </dl>
        {chart}
      </Card>
    </li>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className='flex flex-col'>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='tabular-nums'>{value}</dd>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className='flex justify-between gap-4 border-t border-border py-1.5 text-sm first:border-t-0'>
      <dt className='text-muted-foreground'>{label}</dt>
      <dd className={mono ? 'font-mono' : undefined}>{value}</dd>
    </div>
  );
}
