import { CircleAlert, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

import {
  matchesSchemaVersion,
  SCHEMA_VERSION,
  SERVICE_ACTION,
  useServiceState,
  type ServiceState,
  type SystemProcess,
} from '@entities/Daemon';
import { useServiceAction } from '@features/Daemon/DaemonControl';
import { formatBytes } from '@shared/lib/format';
import { SECTION_LABEL } from '@shared/lib/styles';
import { HOURS_IN_DAY, SECONDS_IN_HOUR } from '@shared/lib/time';
import { cn } from '@shared/lib/utils';
import { Alert, AlertDescription, AlertTitle, Button, Card, CardContent, CardHeader } from '@shared/ui';

const STATUS_LABEL: Readonly<Record<ServiceState['status'], string>> = {
  running: 'работает',
  stopped: 'остановлен',
  failed: 'упал',
};

/** Состояние читается тоном, а не только словом (ADR-0013). */
const STATUS_TONE: Readonly<Record<ServiceState['status'], string>> = {
  running: 'bg-signal-ok',
  stopped: 'bg-signal-idle',
  failed: 'bg-signal-bad',
};

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / SECONDS_IN_HOUR);

  return hours >= HOURS_IN_DAY
    ? `${String(Math.floor(hours / HOURS_IN_DAY))} д ${String(hours % HOURS_IN_DAY)} ч`
    : `${String(hours)} ч`;
}

/**
 * Процесс sing-box: состояние службы, память и управление.
 *
 * Остановленный сервис — данные экрана, а не отказ панели: редактор конфига
 * остаётся доступным, иначе поднять упавший sing-box было бы нечем (NFR-1).
 *
 * Команды показываются, только когда процессом владеет служба демона
 * (`managed`). Чужой процесс ими не управляется: на устройстве маршрутизацию
 * может вести другой пакет, и «Запустить» подняло бы вторую копию sing-box
 * рядом с работающей (AC-36).
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
            <AlertTitle>Состояние сервиса не прочитано</AlertTitle>
            <AlertDescription>{service.error.message}</AlertDescription>
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
          {STATUS_LABEL[state.status]}
        </p>
        {running && !state.managed && <span className='text-xs text-muted-foreground'>поднят другой службой</span>}
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
            Перезапустить
          </Button>
        )}
        {state.managed && (
          <Button
            variant='outline'
            size='sm'
            disabled={action.isPending}
            onClick={() => {
              action.mutate(SERVICE_ACTION.Stop);
            }}
          >
            Остановить
          </Button>
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
            Запустить
          </Button>
        )}
      </CardHeader>

      <CardContent className='flex flex-col gap-3'>
        <dl className='text-sm'>
          {state.managed && <Row label='Аптайм службы' value={formatUptime(state.uptime)} />}
          <Row label='Бинарь' value={state.binary} mono />
          {process !== undefined && (
            <Row label='Память процесса' value={`${formatBytes(process.rss)} · pid ${String(process.pid)}`} />
          )}
          {heap > 0 && <Row label='Память Go' value={formatBytes(heap)} chart={heapChart} />}
        </dl>

        {state.status !== 'running' && state.lastError !== undefined && (
          <Alert variant='destructive'>
            <CircleAlert />
            <AlertTitle>Сервис не поднялся</AlertTitle>
            <AlertDescription>
              {/* Вывод бинаря показывается дословно: разобранный до узла он
                  соврал бы, а сокращённый — потерял бы причину (UX-5). */}
              <pre className='font-mono text-xs whitespace-pre-wrap'>{state.lastError}</pre>
            </AlertDescription>
          </Alert>
        )}

        {drifted && (
          <Alert>
            <TriangleAlert />
            <AlertTitle>Версия sing-box разошлась со схемой форм</AlertTitle>
            <AlertDescription>
              Формы собраны под {SCHEMA_VERSION}, на устройстве {state.binary}. Поле, которого нет в этой версии бинаря,
              отклонит `sing-box check` при Apply — запретить его панель не может: арбитр валидности сам бинарь, а не
              схема metabox (UX-4).
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
