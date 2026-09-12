import { CircleAlert, Info } from 'lucide-react';
import { useEffect, useState } from 'react';

import { APPLY_PHASE, type ApplyTransaction } from '@entities/Daemon';
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
      aria-label='Применение конфига'
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
          <p className='text-sm'>
            {apply.isApplying ? 'Применяю конфиг на устройстве…' : 'Правки в черновике, на устройстве их ещё нет'}
          </p>
          <span className='grow' />
          {!apply.isApplying && (
            <>
              <ConfigApplyDiff canApply={apply.canApply} onApply={apply.apply} />
              <Button size='sm' disabled={!apply.canApply} onClick={apply.apply}>
                Применить
              </Button>
              <Button variant='ghost' size='sm' onClick={apply.discard}>
                Отменить правки
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

/** Go отдаёт `time.Duration` наносекундами. */
const NS_IN_SECOND = 1_000_000_000;

/** Шаг отсчёта: окно подтверждения считается в секундах. */
const TICK_INTERVAL = 1000;

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
  const remaining = useCountdown(Math.ceil(transaction.window / NS_IN_SECOND));

  return (
    <div className='flex flex-col gap-2'>
      <div className='flex flex-wrap items-center gap-x-2.5 gap-y-1'>
        <p className='text-sm'>
          Конфиг применён. Подтвердите, что связь жива, —{' '}
          {remaining > 0 ? (
            <>
              осталось <data value={remaining}>{remaining} с</data>
            </>
          ) : (
            <>иначе демон вернёт предыдущий</>
          )}
        </p>
        <span className='grow' />
        <Button size='sm' disabled={isConfirming} onClick={onConfirm}>
          Связь есть, оставить
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
    }, TICK_INTERVAL);

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
  return (
    <Alert>
      <Info />
      <AlertTitle>metabox дописал в конфиг experimental.clash_api</AlertTitle>
      <AlertDescription>
        Без этой секции экраны рантайма читать нечего. Секция уже в применённом файле — изменение сделал metabox, а не
        вы.
      </AlertDescription>
    </Alert>
  );
}

/** Цикл не дошёл до конца: демон уже вернул предыдущий конфиг или пытался. */
function ApplyFailure({ transaction, onDismiss }: { transaction: ApplyTransaction; onDismiss: () => void }) {
  return (
    <Alert variant='destructive'>
      <CircleAlert />
      <AlertTitle>
        {transaction.phase === APPLY_PHASE.RolledBack
          ? 'Подтверждения не было — предыдущий конфиг возвращён'
          : 'Применение не прошло'}
      </AlertTitle>
      {transaction.reason !== undefined && (
        <AlertDescription>
          <pre className='font-mono text-xs whitespace-pre-wrap'>{transaction.reason}</pre>
        </AlertDescription>
      )}
      <AlertAction>
        <Button variant='ghost' size='sm' onClick={onDismiss}>
          Скрыть
        </Button>
      </AlertAction>
    </Alert>
  );
}
