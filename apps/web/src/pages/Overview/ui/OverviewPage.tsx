import type { ReactNode } from 'react';

import { ConnectionState, useConnectionCounts, useConnectionStream } from '@entities/Connection';
import {
  matchesSchemaVersion,
  RuntimeState,
  SCHEMA_VERSION,
  useClashConfigs,
  useConfigPath,
  useDaemonStatus,
  useRuntimeStream,
  useTrafficNow,
} from '@entities/Daemon';
import { formatBytes, formatRate, plural } from '@shared/lib/format';
import { SECTION_LABEL } from '@shared/lib/styles';
import { cn } from '@shared/lib/utils';
import { Alert, AlertDescription, AlertTitle, Badge, Card, CardContent, CardHeader } from '@shared/ui';
import { DaemonService } from '@widgets/Daemon/DaemonService';
import { DaemonMemory, DaemonTraffic } from '@widgets/Daemon/DaemonTraffic';

const CONNECTION_FORMS = ['соединение', 'соединения', 'соединений'] as const;

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
  const singboxVersion = status.data?.singboxVersion;

  const peakDown = traffic.length > 0 ? Math.max(...traffic.map((sample) => sample.down)) : 0;
  const peakUp = traffic.length > 0 ? Math.max(...traffic.map((sample) => sample.up)) : 0;

  return (
    <>
      <header className='flex min-h-14 shrink-0 flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border px-4 py-3 sm:px-6'>
        <h1 className='text-2xl font-semibold'>Обзор</h1>
        <p className='text-xs text-muted-foreground'>данные рантайма, конфиг не меняется</p>
      </header>

      <div className='flex min-h-0 grow flex-col gap-5 overflow-y-auto px-4 py-5 *:shrink-0 sm:px-6'>
        <Card className='gap-0 py-0'>
          <ul
            aria-label='Показатели рантайма'
            className='grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-x lg:grid-cols-4'
          >
            <Tile
              label='Входящий'
              value={formatRate(now.down)}
              tone='text-series-down'
              context={peakDown > 0 ? `пик за минуту ${formatRate(peakDown)}` : 'пика ещё не было'}
            />
            <Tile
              label='Исходящий'
              value={formatRate(now.up)}
              tone='text-series-up'
              context={peakUp > 0 ? `пик за минуту ${formatRate(peakUp)}` : 'пика ещё не было'}
            />
            <Tile
              label='Активных соединений'
              value={String(counts.active)}
              context={`${plural(counts.closed, CONNECTION_FORMS)} закрыто панелью`}
            />
            {/* Первый сэмпл потока нулевой: до второго честнее прочерк, чем «0 Б». */}
            <Tile
              label='Память sing-box'
              value={memory > 0 ? formatBytes(memory) : '—'}
              context='за десять минут'
              chart={<DaemonMemory samples={memoryHistory} />}
            />
          </ul>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between gap-4'>
            <h2 className={SECTION_LABEL}>Трафик за минуту</h2>
            <p className='flex gap-4 text-xs text-muted-foreground'>
              <span className='flex items-center gap-1.5'>
                <span className='h-0.5 w-3 rounded-full bg-series-down' aria-hidden='true' />
                входящий
              </span>
              <span className='flex items-center gap-1.5'>
                <span className='h-0.5 w-3 rounded-full bg-series-up' aria-hidden='true' />
                исходящий
              </span>
            </p>
          </CardHeader>

          <CardContent className='flex flex-col gap-4'>
            <DaemonTraffic samples={traffic} />

            <dl className='flex gap-8 border-t border-border pt-3'>
              <Total label='Всего получено' value={formatBytes(totals.download)} />
              <Total label='Всего отдано' value={formatBytes(totals.upload)} />
            </dl>
          </CardContent>
        </Card>

        <DaemonService />

        <Card>
          <CardHeader className='flex flex-row items-center gap-2.5'>
            <h2 className={SECTION_LABEL}>Состояние панели</h2>
            <Badge variant={status.isSuccess ? 'secondary' : 'destructive'}>
              {status.isSuccess ? 'демон отвечает' : 'демон не отвечает'}
            </Badge>
          </CardHeader>

          <CardContent>
            <dl>
              <Row label='Демон' value={status.data?.version ?? '—'} mono />
              <Row label='sing-box' value={singboxVersion ?? '—'} mono />
              <Row label='Схема форм' value={SCHEMA_VERSION} mono />
              <Row label='Конфиг' value={configPath} mono />
              <Row label='Режим Clash API' value={clash.data?.mode ?? '—'} />
            </dl>

            {!matchesSchemaVersion(singboxVersion) && (
              <Alert variant='destructive' className='mt-4'>
                <AlertTitle>Версия sing-box разошлась со схемой форм</AlertTitle>
                <AlertDescription>
                  Формы собраны под {SCHEMA_VERSION}, на устройстве {singboxVersion}. Поле, которого нет в этой версии
                  бинаря, отклонит `sing-box check` при Apply.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

/**
 * Ячейка показателя. Высота фиксирована местом под график: без него ячейка с
 * графиком становилась выше соседних и ломала ряд.
 */
function Tile({
  label,
  value,
  context,
  tone,
  chart,
}: {
  label: string;
  value: string;
  context: string;
  tone?: string;
  chart?: ReactNode;
}) {
  return (
    <li className='flex flex-col gap-1 px-4 py-3.5'>
      <dl className='flex flex-col gap-0.5'>
        <dt className='text-xs text-muted-foreground'>{label}</dt>
        <dd className={cn('text-2xl font-semibold tabular-nums', tone)}>{value}</dd>
      </dl>
      <div className='flex h-6 items-end justify-between gap-2'>
        <p className='text-2xs text-muted-foreground'>{context}</p>
        {chart}
      </div>
    </li>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className='flex flex-col gap-0.5'>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='text-sm font-medium tabular-nums'>{value}</dd>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className='flex justify-between gap-4 border-t border-border py-2 text-sm first:border-t-0'>
      <dt className='text-muted-foreground'>{label}</dt>
      <dd className={mono ? 'font-mono' : undefined}>{value}</dd>
    </div>
  );
}
