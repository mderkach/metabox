import type { ParseKeys } from 'i18next';
import { CircleAlert, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  SERVICE_ACTION,
  toConfirmedStatus,
  useServiceState,
  type ServiceErrorCode,
  type ServiceState,
} from '@entities/Daemon';
import { useServiceAction } from '@features/Daemon/DaemonControl';
import { failureText } from '@shared/api';
import { cn } from '@shared/lib/utils';
import { Alert, AlertDescription, AlertTitle, Button, CARD_TITLE, Separator } from '@shared/ui';

import { useLastConfirmedService } from '../lib';
import { formatUptime } from '../lib/DaemonService.uptime';
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
};

/**
 * The sing-box service state and its commands.
 *
 * A stopped service is screen data, not a panel failure: the config editor
 * stays available, otherwise there would be no way to bring up a crashed sing-box.
 *
 * Commands are shown only when the process is owned by the daemon's service
 * (`managed`). A foreign process is not controlled by them: on the device routing
 * may be run by another package, and "Start" would bring up a second copy of sing-box
 * next to the running one.
 *
 * An unread state is not a stop. The block shows the last confirmed
 * state, and the reason as a neutral mark. "Restart"
 * and "Stop" stay if it is confirmed that the process is owned by the daemon's
 * service: a restart via procd also brings up a stopped service. "Start"
 * is not offered when the state is unknown — it would say that sing-box
 * is down. Without a confirmed state there are no commands: whose service runs the process
 * is unknown, and restarting our own with a foreign process would bring up a second copy.
 */
export function DaemonServiceControl() {
  const { t } = useTranslation('widgets/Daemon/DaemonService');
  const service = useServiceState();
  const action = useServiceAction();
  const shown = useLastConfirmedService(service.data);

  if (service.isError) {
    return (
      <Alert variant='destructive'>
        <CircleAlert />
        <AlertTitle>{t('unread')}</AlertTitle>
        <AlertDescription>{failureText(service.error) ?? service.error.message}</AlertDescription>
      </Alert>
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
    <div className='flex flex-col gap-3'>
      <div className='flex flex-wrap items-baseline gap-x-2.5 gap-y-1'>
        <h3 className={CARD_TITLE}>sing-box</h3>
        <p className='flex items-center gap-1.5 self-center text-sm'>
          <span
            aria-hidden='true'
            className={cn('size-2 shrink-0 rounded-full', status === null ? 'bg-signal-idle' : STATUS_TONE[status])}
          />
          {t(status === null ? 'status.unknown' : STATUS_LABEL[status])}
        </p>
        {running && !managed && <span className='text-xs text-muted-foreground'>{t('status.foreign')}</span>}
        {/* The daemon returns zero when the process age could not be determined. */}
        {known && state.managed && state.uptime > 0 && (
          <p className='text-xs text-muted-foreground tabular-nums'>
            {t('uptime.label', { value: formatUptime(t, state.uptime) })}
          </p>
        )}
      </div>

      {(managed || (known && !running)) && (
        <div className='flex flex-wrap items-center gap-2'>
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
        </div>
      )}

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
    </div>
  );
}
