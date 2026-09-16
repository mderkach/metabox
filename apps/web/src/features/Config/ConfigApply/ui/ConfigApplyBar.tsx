import type { ParseKeys } from 'i18next';
import { CircleAlert, Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { APPLY_PHASE, type ApplyReasonCode, type ApplyTransaction } from '@entities/Daemon';
import { MS_IN_SECOND, NS_IN_SECOND } from '@shared/lib/time';
import { Alert, AlertAction, AlertDescription, AlertTitle, Button } from '@shared/ui';

import { useConfigApply } from '../lib/ConfigApply.lib';
import { ConfigApplyCheck } from './ConfigApplyCheck';
import { ConfigApplyDiff } from './ConfigApplyDiff';

/**
 * Бар живёт в оболочке, а не на экране редактора: наличие неприменённых правок
 * и окно подтверждения обязаны быть видны без перехода на отдельный экран
 * (UX-7), а переход между экранами не должен терять окно.
 */
export function ConfigApplyBar() {
  const { t } = useTranslation('features/Config/ConfigApply');
  const apply = useConfigApply();
  const [dismissed, setDismissed] = useState<string | null>(null);
  const phase = apply.transaction?.phase;
  const awaiting = phase === APPLY_PHASE.AwaitingConfirm;
  // Откат и отказ показываются и без черновика: откат версии из истории своего
  // черновика не заводит, а узнать о возврате конфига пользователь обязан
  // (AC-14). Скрывает сообщение он сам — иначе оно исчезло бы раньше, чем его
  // прочитали.
  const failure =
    apply.transaction !== null &&
    apply.transaction.id !== dismissed &&
    (phase === APPLY_PHASE.Failed || phase === APPLY_PHASE.RolledBack);

  if (!apply.isDirty && !awaiting && !failure && phase !== APPLY_PHASE.Applying) {
    return null;
  }

  return (
    <section
      aria-label={t('bar.label')}
      className='flex shrink-0 flex-col gap-2 border-b border-border bg-card px-4 py-2.5 sm:px-6'
    >
      {awaiting && apply.transaction !== null ? (
        // Ключ транзакции пересоздаёт отсчёт: своё окно у каждой, и сбрасывать
        // его из эффекта не нужно.
        <ConfirmWindow
          key={apply.transaction.id}
          transaction={apply.transaction}
          isConfirming={apply.isConfirming}
          onConfirm={apply.confirm}
        />
      ) : (
        <div className='flex flex-wrap items-center gap-x-2.5 gap-y-1'>
          <p className='text-sm'>{apply.isApplying ? t('bar.applying') : t('bar.dirty')}</p>
          <span className='grow' />
          {!apply.isApplying && (
            <>
              <ConfigApplyDiff canApply={apply.canApply} onApply={apply.apply} />
              <Button size='sm' disabled={!apply.canApply} onClick={apply.apply}>
                {t('bar.apply')}
              </Button>
              <Button variant='ghost' size='sm' onClick={apply.discard}>
                {t('bar.discard')}
              </Button>
            </>
          )}
        </div>
      )}

      {apply.check !== null && <ConfigApplyCheck check={apply.check} />}

      {failure && apply.transaction !== null && (
        <ApplyFailure
          transaction={apply.transaction}
          onDismiss={() => {
            setDismissed(apply.transaction?.id ?? null);
          }}
        />
      )}
    </section>
  );
}

/**
 * Окно подтверждения. Остаток приходит от демона — он считает его монотонными
 * часами, потому что часов реального времени у роутера нет (ADR-0002), — а
 * браузер только тикает между ответами. Истина всё равно на устройстве: по
 * нулю здесь ничего не происходит, откат делает демон, а опрос приносит новую
 * фазу (AC-14).
 */
function ConfirmWindow({
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
      <div className='flex flex-wrap items-center gap-x-2.5 gap-y-1'>
        <p className='text-sm'>
          {t('confirm.prompt')}{' '}
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

      {transaction.clashApiAdded === true && <ClashAPIAdded />}
    </div>
  );
}

function useCountdown(seconds: number): number {
  const [left, setLeft] = useState(seconds);

  useEffect(function countDown() {
    const timer = setInterval(function tick() {
      setLeft((current) => Math.max(0, current - 1));
      // Окно подтверждения считается в секундах (NFR-5), шаг отсчёта тот же.
    }, MS_IN_SECOND);

    return function stopCountdown() {
      clearInterval(timer);
    };
  }, []);

  return left;
}

/**
 * Секция `experimental.clash_api` дописана демоном (AC-31, AC-32): без неё
 * рантайм читать нечем, и пользователю это показывается как чужая правка в его
 * файле, а не как его собственная.
 */
function ClashAPIAdded() {
  const { t } = useTranslation('features/Config/ConfigApply');
  return (
    <Alert>
      <Info />
      <AlertTitle>{t('clashApi.title')}</AlertTitle>
      <AlertDescription>{t('clashApi.description')}</AlertDescription>
    </Alert>
  );
}

/** Цикл не дошёл до конца: демон уже вернул предыдущий конфиг или пытался. */
/**
 * Шаг, на котором встал цикл, — словами пользователя. Таблица обязана покрывать
 * набор демона целиком: новый шаг у него — ошибка компиляции здесь.
 */
const REASON_KEY: Readonly<Record<ApplyReasonCode, ParseKeys<'features/Config/ConfigApply'>>> = {
  backup_failed: 'failure.reason.backup_failed',
  write_failed: 'failure.reason.write_failed',
  restart_failed: 'failure.reason.restart_failed',
  healthcheck_failed: 'failure.reason.healthcheck_failed',
  rollback_failed: 'failure.reason.rollback_failed',
};

function ApplyFailure({ transaction, onDismiss }: { transaction: ApplyTransaction; onDismiss: () => void }) {
  const { t } = useTranslation('features/Config/ConfigApply');
  const reasonKey = transaction.reasonCode === undefined ? undefined : REASON_KEY[transaction.reasonCode];

  return (
    <Alert variant='destructive'>
      <CircleAlert />
      <AlertTitle>
        {transaction.phase === APPLY_PHASE.RolledBack ? t('failure.rolledBack') : t('failure.failed')}
      </AlertTitle>
      {/* Причина — переводом по коду шага, а ошибка демона под ней: она на его
          языке, но по ней чинят. */}
      {reasonKey !== undefined && <AlertDescription>{t(reasonKey)}</AlertDescription>}
      {transaction.reason !== undefined && (
        <AlertDescription>
          <pre className='font-mono text-xs whitespace-pre-wrap'>{transaction.reason}</pre>
        </AlertDescription>
      )}
      <AlertAction>
        <Button variant='ghost' size='sm' onClick={onDismiss}>
          {t('failure.dismiss')}
        </Button>
      </AlertAction>
    </Alert>
  );
}
