import { CircleAlert, TriangleAlert } from 'lucide-react';

import { SERVICE_ACTION, useServiceAction, useServiceState, type ServiceState } from '@entities/Daemon';
import { Alert, AlertDescription, AlertTitle, Badge, Button, Card, CardContent, CardHeader } from '@shared/ui';

const STATUS_LABEL: Readonly<Record<ServiceState['status'], string>> = {
  running: 'работает',
  stopped: 'остановлен',
  failed: 'упал',
};

const SECONDS_IN_HOUR = 3600;
const HOURS_IN_DAY = 24;

function formatUptime(seconds: number): string {
  if (seconds === 0) {
    return '—';
  }

  const hours = Math.floor(seconds / SECONDS_IN_HOUR);

  return hours >= HOURS_IN_DAY
    ? `${String(Math.floor(hours / HOURS_IN_DAY))} д ${String(hours % HOURS_IN_DAY)} ч`
    : `${String(hours)} ч`;
}

/**
 * Состояние sing-box и управление им.
 *
 * Остановленный сервис — данные экрана, а не отказ панели: редактор конфига
 * остаётся доступным, иначе поднять упавший sing-box было бы нечем (NFR-1).
 */
export function DaemonService() {
  const service = useServiceState();
  const action = useServiceAction();

  if (!service.isSuccess) {
    return null;
  }

  const state = service.data;
  const running = state.status === 'running';
  const drifted = state.binary !== state.schema;

  return (
    <Card>
      <CardHeader className='flex flex-row items-center gap-2.5'>
        <h2 className='text-sm font-medium'>Сервис sing-box</h2>
        <Badge variant={running ? 'secondary' : 'destructive'}>{STATUS_LABEL[state.status]}</Badge>
        <span className='grow' />
        <Button
          variant='outline'
          size='sm'
          disabled={action.isPending}
          onClick={() => {
            action.mutate(running ? SERVICE_ACTION.Restart : SERVICE_ACTION.Start);
          }}
        >
          {running ? 'Перезапустить' : 'Запустить'}
        </Button>
        {running && (
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
      </CardHeader>

      <CardContent className='flex flex-col gap-3'>
        <dl className='text-sm'>
          <Row label='Аптайм' value={formatUptime(state.uptime)} />
          <Row label='Бинарь на устройстве' value={state.binary} mono />
          <Row label='Схема панели собрана на' value={state.schema} mono />
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
            <AlertTitle>Бинарь новее схемы панели</AlertTitle>
            <AlertDescription>
              Поля, которых нет в схеме, панель покажет сырыми блоками и сохранит как есть. Запретить их она не может:
              арбитр валидности — <code className='font-mono'>sing-box check</code>, а не схема metabox.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className='flex justify-between gap-4 border-t border-border py-1.5 first:border-t-0'>
      <dt className='text-muted-foreground'>{label}</dt>
      <dd className={mono ? 'font-mono' : undefined}>{value}</dd>
    </div>
  );
}
