import type { ParseKeys } from 'i18next';
import { CircleAlert, LoaderCircle, Timer } from 'lucide-react';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { APPLY_PHASE, type ApplyReasonCode, type ApplyTransaction } from '@entities/Daemon';
import { NS_IN_SECOND } from '@shared/lib/time';
import { useCountdown } from '@shared/lib/useCountdown';
import { Alert, AlertAction, AlertDescription, AlertTitle, Button } from '@shared/ui';

/**
 * Шаг, на котором встала смена, словами пользователя. Своя таблица, а не
 * таблица бара конфига: коды у циклов общие, а предмет разный — UCI и
 * настройки перехвата, а не файл конфига. Новый код демона — ошибка
 * компиляции здесь.
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
 * Ход смены списка перехвата на экране устройств: запись, окно подтверждения,
 * откат или отказ с причиной. Бар применения конфига сюда не годится — он
 * собран вокруг черновика документа и ведёт одну транзакцию конфига.
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

/** Остаток считает демон, браузер лишь тикает между ответами опроса: откат по нулю делает демон. */
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
        {/* Живая область только у неизменной части: иначе остаток переобъявлялся бы каждую секунду. */}
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
