import { Timer } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';

import { type ApplyTransaction } from '@entities/Daemon';
import { NS_IN_SECOND } from '@shared/lib/time';
import { useCountdown } from '@shared/lib/useCountdown';
import { Button } from '@shared/ui';

import { ConfigApplyClashApiAdded } from './ConfigApplyClashApiAdded';

/**
 * The remainder comes from the daemon, which counts it with a monotonic clock
 * because the router has no real-time clock, while the browser only ticks
 * between responses: nothing happens at zero here, the daemon does the
 * rollback. Each poll response resyncs the countdown, so a `setInterval`
 * throttled in a background tab does not accumulate drift.
 */
export function ConfigApplyConfirmWindow({
  transaction,
  isConfirming,
  onConfirm,
}: {
  transaction: ApplyTransaction;
  isConfirming: boolean;
  onConfirm: () => void;
}) {
  const { t } = useTranslation('features/Config/ConfigApply');
  const remaining = useCountdown(Math.ceil(transaction.window / NS_IN_SECOND));

  return (
    <div className='flex flex-col gap-2'>
      <div className='flex min-h-7 flex-wrap items-center gap-x-2.5 gap-y-1'>
        <Timer className='size-4 shrink-0 text-muted-foreground' />
        <p className='text-sm'>
          {/* The live region is only on the unchanging part: otherwise the
              ticking remainder would reannounce the whole window every second.
              */}
          <span role='status'>{t('confirm.prompt')}</span>{' '}
          {remaining > 0 ? (
            <Trans
              t={t}
              i18nKey='confirm.left'
              values={{ seconds: remaining }}
              components={{ time: <data value={remaining} /> }}
            />
          ) : (
            t('confirm.rollback')
          )}
        </p>
        <span className='grow' />
        <Button size='sm' disabled={isConfirming} onClick={onConfirm}>
          {t('confirm.submit')}
        </Button>
      </div>

      {transaction.clashApiAdded === true && <ConfigApplyClashApiAdded />}
    </div>
  );
}
