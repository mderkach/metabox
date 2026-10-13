import type { ParseKeys } from 'i18next';
import { CircleAlert, LoaderCircle, Timer } from 'lucide-react';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { APPLY_PHASE, type ApplyReasonCode, type ApplyTransaction } from '@entities/Daemon';
import { NS_IN_SECOND } from '@shared/lib/time';
import { useCountdown } from '@shared/lib/useCountdown';
import { Alert, AlertAction, AlertDescription, AlertTitle, Button } from '@shared/ui';

/**
 * The step the change stopped at, in the user's words. A table of its own, not
 * the config bar table: the cycle codes are shared, but the subject differs,
 * UCI and interception settings rather than the config file. A new daemon code
 * is a compile error here.
 */
const REASON_KEY: Readonly<Record<ApplyReasonCode, ParseKeys<'features/Device/DeviceRoute'>>> = {
  backup_failed: 'failure.reason.backup_failed',
  write_failed: 'failure.reason.write_failed',
  restart_failed: 'failure.reason.restart_failed',
  healthcheck_failed: 'failure.reason.healthcheck_failed',
  dns_probe_failed: 'failure.reason.dns_probe_failed',
  interception_missing: 'failure.reason.interception_missing',
  rollback_failed: 'failure.reason.rollback_failed',
  no_backup: 'failure.reason.no_backup',
};

/**
 * Progress of an interception list change on the devices screen: the write, the
 * confirmation window, rollback or a failure with a reason. The config apply
 * bar does not fit here: it is built around the document draft and drives one
 * config transaction.
 */
export function DeviceRouteBar({
  transaction,
  isConfirming,
  onConfirm,
}: {
  transaction: ApplyTransaction | null;
  isConfirming: boolean;
  onConfirm: () => void;
}) {
  const { t } = useTranslation('features/Device/DeviceRoute');
  const [dismissed, setDismissed] = useState<string | null>(null);

  if (transaction === null) return null;

  switch (transaction.phase) {
    case APPLY_PHASE.Applying:
      return (
        <section aria-label={t('bar.label')} className='flex items-center gap-2.5'>
          <LoaderCircle className='size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none' />
          <p role='status' className='text-sm'>
            {t('bar.applying')}
          </p>
        </section>
      );
    case APPLY_PHASE.AwaitingConfirm:
      return (
        <section aria-label={t('bar.label')}>
          <ConfirmWindow
            key={transaction.id}
            transaction={transaction}
            isConfirming={isConfirming}
            onConfirm={onConfirm}
          />
        </section>
      );
    case APPLY_PHASE.Failed:
    case APPLY_PHASE.RolledBack:
      return transaction.id === dismissed ? null : (
        <section aria-label={t('bar.label')}>
          <RouteFailure
            transaction={transaction}
            onDismiss={() => {
              setDismissed(transaction.id);
            }}
          />
        </section>
      );
    case APPLY_PHASE.Confirmed:
      return null;
  }
}

/** The remainder is counted by the daemon, the browser only ticks between poll responses: rollback at zero is done by the daemon. */
function ConfirmWindow({
  transaction,
  isConfirming,
  onConfirm,
}: {
  transaction: ApplyTransaction;
  isConfirming: boolean;
  onConfirm: () => void;
}) {
  const { t } = useTranslation('features/Device/DeviceRoute');
  const remaining = useCountdown(Math.ceil(transaction.window / NS_IN_SECOND));

  return (
    <div className='flex min-h-7 flex-wrap items-center gap-x-2.5 gap-y-1'>
      <Timer className='size-4 shrink-0 text-muted-foreground' />
      <p className='text-sm'>
        {/* The live region is only on the unchanging part: otherwise the remainder would be reannounced every second. */}
        <span role='status'>{t('bar.prompt')}</span>{' '}
        {remaining > 0 ? (
          <Trans
            t={t}
            i18nKey='bar.left'
            values={{ seconds: remaining }}
            components={{ time: <data value={remaining} /> }}
          />
        ) : (
          t('bar.rollback')
        )}
      </p>
      <span className='grow' />
      <Button size='sm' disabled={isConfirming} onClick={onConfirm}>
        {t('bar.submit')}
      </Button>
    </div>
  );
}

function RouteFailure({ transaction, onDismiss }: { transaction: ApplyTransaction; onDismiss: () => void }) {
  const { t } = useTranslation('features/Device/DeviceRoute');
  const reasonKey = transaction.reasonCode === undefined ? undefined : REASON_KEY[transaction.reasonCode];

  return (
    <Alert variant='destructive' className='max-sm:pr-2.5'>
      <CircleAlert />
      <AlertTitle>
        {transaction.phase === APPLY_PHASE.RolledBack ? t('failure.rolledBack') : t('failure.failed')}
      </AlertTitle>
      {reasonKey !== undefined && <AlertDescription>{t(reasonKey)}</AlertDescription>}
      {transaction.reason !== undefined && (
        <AlertDescription>
          <pre className='font-mono text-xs whitespace-pre-wrap'>{transaction.reason}</pre>
        </AlertDescription>
      )}
      <AlertAction className='static col-start-2 mt-2 justify-self-start sm:absolute sm:mt-0'>
        <Button variant='ghost' size='sm' onClick={onDismiss}>
          {t('failure.dismiss')}
        </Button>
      </AlertAction>
    </Alert>
  );
}
