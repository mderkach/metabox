import type { ParseKeys } from 'i18next';
import { CircleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { APPLY_PHASE, type ApplyReasonCode, type ApplyTransaction } from '@entities/Daemon';
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
  lists_restored: 'failure.reason.lists_restored',
};

export function DeviceRouteFailure({
  transaction,
  onDismiss,
}: {
  transaction: ApplyTransaction;
  onDismiss: () => void;
}) {
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
