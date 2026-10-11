import type { ParseKeys, TFunction } from 'i18next';
import { CircleAlert, Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import {
  SERVICE_ACTION,
  toConfirmedStatus,
  useServiceState,
  type ServiceErrorCode,
  type ServiceState,
  type SystemProcess,
} from '@entities/Daemon';
import { useServiceAction } from '@features/Daemon/DaemonControl';
import { failureText } from '@shared/api';
import { formatBytes } from '@shared/lib/format';
import { HOURS_IN_DAY, SECONDS_IN_HOUR, SECONDS_IN_MINUTE } from '@shared/lib/time';
import { cn } from '@shared/lib/utils';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardHeader,
  SECTION_LABEL,
  Separator,
} from '@shared/ui';

import { useLastConfirmedService } from '../lib';
import { DaemonServiceStop } from './DaemonServiceStop';

const STATUS_LABEL = {
  running: 'status.running',
  stopped: 'status.stopped',
  failed: 'status.failed',
} as const satisfies Readonly<Record<ServiceState['status'], ParseKeys<'widgets/Daemon/DaemonService'>>>;

/** Состояние читается тоном, а не только словом. */
const STATUS_TONE: Readonly<Record<ServiceState['status'], string>> = {
  running: 'bg-signal-ok',
  stopped: 'bg-signal-idle',
  failed: 'bg-signal-bad',
};

/** Почему состояние подставлено, словами пользователя: новый код демона — ошибка компиляции здесь. */
const REASON_KEY: Readonly<Record<ServiceErrorCode, ParseKeys<'widgets/Daemon/DaemonService'>>> = {
  service_state_unread: 'reason.service_state_unread',
  service_instance_ambiguous: 'reason.service_instance_ambiguous',
};

/** Первый час — минутами: «0 ч» у только что запущенного процесса читается как поломка. */
function formatUptime(t: TFunction<'widgets/Daemon/DaemonService'>, seconds: number): string {
  if (seconds < SECONDS_IN_MINUTE) {
    return t('uptime.underMinute');
  }

  if (seconds < SECONDS_IN_HOUR) {
    return t('uptime.minutes', { minutes: Math.floor(seconds / SECONDS_IN_MINUTE) });
  }

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
 *
 * Непрочитанное состояние — не остановка. Карточка показывает последнее
 * подтверждённое состояние, а причину — нейтральной пометкой. «Перезапустить»
 * и «Остановить» остаются, если подтверждено, что процессом владеет служба
 * демона: рестарт через procd поднимает и остановленную службу. «Запустить»
 * при неизвестном состоянии не предлагается — оно говорило бы, что sing-box
 * лежит. Без подтверждённого состояния команд нет: чья служба ведёт процесс,
 * неизвестно, а рестарт своей при чужом процессе поднял бы вторую копию.
 */
export function DaemonService({
  process,
  heap,
  memoryTrend,
}: {
  /** Показания процесса из топика `system`; пусто, когда процесс не найден. */
  process?: SystemProcess;
  /** Память рантайма Go из Clash API: она меньше RSS на резидентный код. */
  heap: number;
  /**
   * История памяти процесса под строками — по ней видна утечка. Готовым узлом:
   * слайсы одного слоя друг друга не импортируют.
   */
  memoryTrend?: ReactNode;
}) {
  const { t } = useTranslation('widgets/Daemon/DaemonService');
  const service = useServiceState();
  const action = useServiceAction();
  const shown = useLastConfirmedService(service.data);

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
  const known = toConfirmedStatus(state) !== null;
  const status = shown?.status ?? null;
  const managed = shown?.managed ?? false;
  const running = status === 'running';

  return (
    <Card>
      <CardHeader className='flex flex-row flex-wrap items-center gap-2.5'>
        <h3 className={SECTION_LABEL}>sing-box</h3>
        <p className='flex items-center gap-1.5 text-xs'>
          <span
            aria-hidden='true'
            className={cn('size-2 shrink-0 rounded-full', status === null ? 'bg-signal-idle' : STATUS_TONE[status])}
          />
          {t(status === null ? 'status.unknown' : STATUS_LABEL[status])}
        </p>
        {running && !managed && <span className='text-xs text-muted-foreground'>{t('status.foreign')}</span>}
        <span className='grow' />
        {managed && (
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
        {managed && (
          <>
            {/* Остановка обрывает маршрутизацию на роутере целиком, перезапуск
                нет. Одинаковыми кнопками подряд эти два действия не различить. */}
            <Separator orientation='vertical' className='mx-0.5 h-5' />
            <DaemonServiceStop
              disabled={action.isPending}
              onConfirm={() => {
                action.mutate(SERVICE_ACTION.Stop);
              }}
            />
          </>
        )}
        {known && !running && (
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
          {/* Ноль демон отдаёт, когда возраст процесса узнать не удалось. */}
          {known && state.managed && state.uptime > 0 && (
            <Row label={t('stat.uptime', { ns: 'shared' })} value={formatUptime(t, state.uptime)} />
          )}
          <Row label={t('row.binary')} value={state.binary} mono />
          {process !== undefined && (
            <Row label={t('row.processMemory')} value={`${formatBytes(process.rss)} · pid ${String(process.pid)}`} />
          )}
          {heap > 0 && <Row label={t('row.goMemory')} value={formatBytes(heap)} />}
        </dl>

        {memoryTrend}

        {state.lastErrorCode !== undefined && (
          <Alert>
            <Info />
            <AlertTitle>{t(REASON_KEY[state.lastErrorCode])}</AlertTitle>
            {state.lastError !== undefined && (
              <AlertDescription>
                <pre className='font-mono text-xs whitespace-pre-wrap'>{state.lastError}</pre>
              </AlertDescription>
            )}
          </Alert>
        )}

        {known && !running && state.lastError !== undefined && (
          <Alert variant='destructive'>
            <CircleAlert />
            <AlertTitle>{t('crashed')}</AlertTitle>
            <AlertDescription>
              <pre className='font-mono text-xs whitespace-pre-wrap'>{state.lastError}</pre>
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
