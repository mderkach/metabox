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
import { DaemonServiceRestart } from './DaemonServiceRestart';
import { DaemonServiceStop } from './DaemonServiceStop';

const STATUS_LABEL = {
  running: 'status.running',
  stopped: 'status.stopped',
  failed: 'status.failed',
} as const satisfies Readonly<Record<ServiceState['status'], ParseKeys<'widgets/Daemon/DaemonService'>>>;

/** State is read by tone, not only by word. */
const STATUS_TONE: Readonly<Record<ServiceState['status'], string>> = {
  running: 'bg-signal-ok',
  stopped: 'bg-signal-idle',
  failed: 'bg-signal-bad',
};

/** Why the state is substituted, in the user's words: a new daemon code is a compile error here. */
const REASON_KEY: Readonly<Record<ServiceErrorCode, ParseKeys<'widgets/Daemon/DaemonService'>>> = {
  service_state_unread: 'reason.service_state_unread',
  service_instance_ambiguous: 'reason.service_instance_ambiguous',
};

/** The first hour in minutes: "0 h" for a just-started process reads as breakage. */
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
 * The sing-box process: service state, memory and control.
 *
 * A stopped service is screen data, not a panel failure: the config editor
 * stays available, otherwise there would be no way to bring up a crashed sing-box.
 *
 * Commands are shown only when the process is owned by the daemon's service
 * (`managed`). A foreign process is not controlled by them: on the device routing
 * may be run by another package, and "Start" would bring up a second copy of sing-box
 * next to the running one.
 *
 * An unread state is not a stop. The card shows the last confirmed
 * state, and the reason as a neutral mark. "Restart"
 * and "Stop" stay if it is confirmed that the process is owned by the daemon's
 * service: a restart via procd also brings up a stopped service. "Start"
 * is not offered when the state is unknown — it would say that sing-box
 * is down. Without a confirmed state there are no commands: whose service runs the process
 * is unknown, and restarting our own with a foreign process would bring up a second copy.
 */
export function DaemonService({
  process,
  heap,
  memoryTrend,
}: {
  /** Process readings from the `system` topic; empty when the process is not found. */
  process?: SystemProcess;
  /** Go runtime memory from Clash API: it is smaller than RSS by the resident code. */
  heap: number;
  /**
   * Process memory history under the rows — a leak is visible in it. As a ready node:
   * slices of one layer do not import each other.
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
          <DaemonServiceRestart
            disabled={action.isPending}
            onConfirm={() => {
              action.mutate(SERVICE_ACTION.Restart);
            }}
          />
        )}
        {managed && (
          <>
            {/* Stop cuts off routing until a start, a restart only drops the
                current connections. Two identical buttons in a row do not tell
                these two actions apart. */}
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
          {/* The daemon returns zero when the process age could not be determined. */}
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
