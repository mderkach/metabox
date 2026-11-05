import { LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { APPLY_PHASE, type ApplyTransaction } from '@entities/Daemon';

import { DeviceRouteConfirmWindow } from './DeviceRouteConfirmWindow';
import { DeviceRouteFailure } from './DeviceRouteFailure';

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
          <DeviceRouteConfirmWindow
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
          <DeviceRouteFailure
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
