import { Timer } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';

import { type ApplyTransaction } from '@entities/Daemon';
import { NS_IN_SECOND } from '@shared/lib/time';
import { useCountdown } from '@shared/lib/useCountdown';
import { Button } from '@shared/ui';

/** The remainder is counted by the daemon, the browser only ticks between poll responses: rollback at zero is done by the daemon. */
export function DeviceRouteConfirmWindow({
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
