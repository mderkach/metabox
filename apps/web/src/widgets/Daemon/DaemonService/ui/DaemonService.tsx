import type { ParseKeys, TFunction } from 'i18next';
import { CircleAlert, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import {
  matchesSchemaVersion,
  SCHEMA_VERSION,
  SERVICE_ACTION,
  useServiceState,
  type ServiceState,
  type SystemProcess,
} from '@entities/Daemon';
import { useServiceAction } from '@features/Daemon/DaemonControl';
import { failureText } from '@shared/api';
import { formatBytes } from '@shared/lib/format';
import { HOURS_IN_DAY, SECONDS_IN_HOUR } from '@shared/lib/time';
import { cn } from '@shared/lib/utils';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardHeader,
  DESTRUCTIVE_OUTLINE,
  SECTION_LABEL,
  Separator,
} from '@shared/ui';

const STATUS_LABEL = {
  running: 'status.running',
  stopped: 'status.stopped',
  failed: 'status.failed',
} as const satisfies Readonly<Record<ServiceState['status'], ParseKeys<'widgets/Daemon/DaemonService'>>>;

/** Состояние читается тоном, а не только словом (ADR-0013). */
const STATUS_TONE: Readonly<Record<ServiceState['status'], string>> = {
  running: 'bg-signal-ok',
  stopped: 'bg-signal-idle',
  failed: 'bg-signal-bad',
};

function formatUptime(t: TFunction<'widgets/Daemon/DaemonService'>, seconds: number): string {
  const hours = Math.floor(seconds / SECONDS_IN_HOUR);

  return hours >= HOURS_IN_DAY
    ? t('uptime.days', { days: Math.floor(hours / HOURS_IN_DAY), hours: hours % HOURS_IN_DAY })
    : t('uptime.hours', { hours });
}

/**
 * Процесс sing-box: состояние службы, память и управление.
 *
 * Остановленный сервис — данные экрана, а не отказ панели: редактор конфига
 * остаётся доступным, иначе поднять упавший sing-box было бы нечем.
 *
 * Команды показываются, только когда процессом владеет служба демона
 * (`managed`). Чужой процесс ими не управляется: на устройстве маршрутизацию
 * может вести другой пакет, и «Запустить» подняло бы вторую копию sing-box
 * рядом с работающей.
 */
export function DaemonService({
  process,
  heap,
  heapChart,
}: {
  /** Показания процесса из топика `system`; пусто, когда процесс не найден. */
  process?: SystemProcess;
  /** Память рантайма Go из Clash API: она меньше RSS на резидентный код. */
  heap: number;
  /** Готовым узлом: слайсы одного слоя друг друга не импортируют. */
  heapChart?: ReactNode;
}) {
  const { t } = useTranslation('widgets/Daemon/DaemonService');
  const service = useServiceState();
  const action = useServiceAction();

  if (service.isError) {
    return (
      <Card>
        <CardHeader>
          <h3 className={SECTION_LABEL}>sing-box</h3>
        </CardHeader>
        <CardContent>
          <Alert variant='destructive'>
            <CircleAlert />
            <AlertTitle>{t('unread')}</AlertTitle>
            <AlertDescription>{failureText(service.error) ?? service.error.message}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!service.isSuccess) {
    return null;
  }

  const state = service.data;
  const running = state.status === 'running';
  const drifted = !matchesSchemaVersion(state.binary);

  return (
    <Card>
      <CardHeader className='flex flex-row flex-wrap items-center gap-2.5'>
        <h3 className={SECTION_LABEL}>sing-box</h3>
        <p className='flex items-center gap-1.5 text-xs'>
          <span aria-hidden='true' className={cn('size-2 shrink-0 rounded-full', STATUS_TONE[state.status])} />
          {t(STATUS_LABEL[state.status])}
        </p>
        {running && !state.managed && <span className='text-xs text-muted-foreground'>{t('status.foreign')}</span>}
        <span className='grow' />
        {state.managed && (
          <Button
            variant='outline'
            size='sm'
            disabled={action.isPending}
            onClick={() => {
              action.mutate(SERVICE_ACTION.Restart);
            }}
          >
            {t('action.restart')}
          </Button>
        )}
        {state.managed && (
          <>
            {/* Остановка обрывает маршрутизацию на роутере целиком, перезапуск
                нет. Одинаковыми кнопками подряд эти два исхода не различить. */}
            <Separator orientation='vertical' className='mx-0.5 h-5' />
            <Button
              variant='outline'
              size='sm'
              disabled={action.isPending}
              className={DESTRUCTIVE_OUTLINE}
              onClick={() => {
                action.mutate(SERVICE_ACTION.Stop);
              }}
            >
              {t('action.stop')}
            </Button>
          </>
        )}
        {!running && (
          <Button
            variant='outline'
            size='sm'
            disabled={action.isPending}
            onClick={() => {
              action.mutate(SERVICE_ACTION.Start);
            }}
          >
            {t('action.start')}
          </Button>
        )}
      </CardHeader>

      <CardContent className='flex flex-col gap-3'>
        <dl className='text-sm'>
          {state.managed && <Row label={t('row.uptime')} value={formatUptime(t, state.uptime)} />}
          <Row label={t('row.binary')} value={state.binary} mono />
          {process !== undefined && (
            <Row label={t('row.processMemory')} value={`${formatBytes(process.rss)} · pid ${String(process.pid)}`} />
          )}
          {heap > 0 && <Row label={t('row.goMemory')} value={formatBytes(heap)} chart={heapChart} />}
        </dl>

        {state.status !== 'running' && state.lastError !== undefined && (
          <Alert variant='destructive'>
            <CircleAlert />
            <AlertTitle>{t('crashed')}</AlertTitle>
            <AlertDescription>
              <pre className='font-mono text-xs whitespace-pre-wrap'>{state.lastError}</pre>
            </AlertDescription>
          </Alert>
        )}

        {drifted && (
          <Alert>
            <TriangleAlert />
            <AlertTitle>{t('drift.title')}</AlertTitle>
            <AlertDescription>
              {t('drift.description', { schema: SCHEMA_VERSION, binary: state.binary })}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  mono = false,
  chart,
}: {
  label: string;
  value: string;
  mono?: boolean;
  chart?: ReactNode;
}) {
  return (
    <div className='flex items-center justify-between gap-4 border-t border-border py-2 first:border-t-0'>
      <dt className='text-muted-foreground'>{label}</dt>
      <dd className={cn('flex min-w-0 items-center gap-3 truncate', mono && 'font-mono text-xs')}>
        {chart}
        {value}
      </dd>
    </div>
  );
}
