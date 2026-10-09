import type { ParseKeys } from 'i18next';
import { CircleAlert, FilePen, Info, LoaderCircle, Timer } from 'lucide-react';
import { useMemo, useState, type TransitionEvent } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { APPLY_PHASE, type ApplyReasonCode, type ApplyTransaction } from '@entities/Daemon';
import { useReducedMotion } from '@shared/lib/media';
import { NS_IN_SECOND } from '@shared/lib/time';
import { useCountdown } from '@shared/lib/useCountdown';
import { cn } from '@shared/lib/utils';
import { Alert, AlertAction, AlertDescription, AlertTitle, Button, Separator } from '@shared/ui';

import { useConfigApply } from '../lib/ConfigApply.lib';
import { ConfigApplyCheck } from './ConfigApplyCheck';
import { ConfigApplyDiff } from './ConfigApplyDiff';
import { ConfigApplyDiscard } from './ConfigApplyDiscard';
import { ConfigApplyStale } from './ConfigApplyStale';
import { ConfigApplyWorkdir } from './ConfigApplyWorkdir';

/**
 * Бар живёт в оболочке, а не на экране редактора: неприменённые правки и окно
 * подтверждения видны с любого экрана и переживают переход между ними.
 */
export function ConfigApplyBar() {
  const { t } = useTranslation('features/Config/ConfigApply');
  const apply = useConfigApply();
  const [dismissed, setDismissed] = useState<string | null>(null);
  const phase = apply.transaction?.phase;
  const awaiting = phase === APPLY_PHASE.AwaitingConfirm;
  // Откат и отказ показываются и без черновика: откат версии из истории своего
  // черновика не заводит. Скрывает сообщение пользователь сам — иначе оно
  // исчезло бы раньше, чем его прочитали.
  const failure =
    apply.transaction !== null &&
    apply.transaction.id !== dismissed &&
    (phase === APPLY_PHASE.Failed || phase === APPLY_PHASE.RolledBack);

  const visible = apply.isDirty || awaiting || failure || phase === APPLY_PHASE.Applying;
  const current = useMemo(
    () => ({
      awaiting,
      failure,
      isStale: apply.isStale,
      isApplying: apply.isApplying,
      transaction: apply.transaction,
      check: apply.check,
      workdir: apply.workdir,
    }),
    [awaiting, failure, apply.isStale, apply.isApplying, apply.transaction, apply.check, apply.workdir]
  );
  // Уходящий бар сворачивается с тем текстом, с которым его видели: свежее
  // состояние за время сворачивания подменило бы, например, окно подтверждения
  // строкой «правки в черновике».
  const [held, setHeld] = useState<typeof current | null>(null);
  const reducedMotion = useReducedMotion();

  if (visible && held !== current) {
    setHeld(current);
  }

  // Без анимации `transitionend` не придёт, и снимок остался бы в DOM вместе
  // с тикающим таймером окна подтверждения.
  if (!visible && reducedMotion && held !== null) {
    setHeld(null);
  }

  const shown = visible ? current : held;

  function dropHeld(event: TransitionEvent<HTMLDivElement>) {
    if (!visible && event.target === event.currentTarget) {
      setHeld(null);
    }
  }

  // Высоту анимирует CSS, а не граница `<ViewTransition>`: экран под баром —
  // именованная группа `page`, вне перехода роутера она стоит без анимации,
  // и содержимое прыгало бы на высоту бара.
  return (
    <div
      inert={!visible}
      aria-hidden={!visible}
      onTransitionEnd={dropHeld}
      className={cn(
        'grid shrink-0 transition-[grid-template-rows] duration-(--view-transition-panel) ease-(--view-transition-ease) motion-reduce:transition-none',
        visible ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
      )}
    >
      <div className='min-h-0 overflow-hidden'>
        {shown !== null && (
          <section
            aria-label={t('bar.label')}
            className='flex flex-col gap-2 border-b border-border bg-card px-4 py-2.5 sm:px-6'
          >
            {shown.awaiting && shown.transaction !== null ? (
              <ConfirmWindow
                key={shown.transaction.id}
                transaction={shown.transaction}
                isConfirming={apply.isConfirming}
                onConfirm={apply.confirm}
              />
            ) : (
              <div className='flex min-h-7 flex-wrap items-center gap-x-2.5 gap-y-1'>
                {shown.isApplying ? (
                  <LoaderCircle className='size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none' />
                ) : (
                  <FilePen className='size-4 shrink-0 text-muted-foreground' />
                )}
                <p className='text-sm'>{shown.isApplying ? t('bar.applying') : t('bar.dirty')}</p>
                <span className='grow' />
                {/* Сброс держится с краю группы, подальше от «Применить»:
                    промах по соседней кнопке открывал бы сброс вместо применения. */}
                {!shown.isApplying && (
                  <>
                    <ConfigApplyDiscard onDiscard={apply.discard} />
                    <Separator orientation='vertical' className='mx-1.5 h-5' />
                    <ConfigApplyDiff canApply={apply.canApply} onApply={apply.apply} />
                    <Button size='sm' disabled={!apply.canApply} onClick={apply.apply}>
                      {t('bar.apply')}
                    </Button>
                  </>
                )}
              </div>
            )}

            {shown.isStale && !shown.isApplying && !shown.awaiting && <ConfigApplyStale onDiscard={apply.discard} />}

            {shown.check !== null && <ConfigApplyCheck check={shown.check} />}

            {shown.workdir !== null && <ConfigApplyWorkdir mismatch={shown.workdir} />}

            {shown.failure && shown.transaction !== null && (
              <ApplyFailure
                transaction={shown.transaction}
                onDismiss={() => {
                  setDismissed(shown.transaction?.id ?? null);
                }}
              />
            )}
          </section>
        )}
      </div>
    </div>
  );
}

/**
 * Остаток приходит от демона — он считает его монотонными часами, потому что
 * часов реального времени у роутера нет, — а браузер лишь тикает
 * между ответами: по нулю здесь ничего не происходит, откат делает демон.
 * Каждый ответ опроса пересинхронизирует отсчёт, поэтому дросселированный в
 * фоновой вкладке `setInterval` не копит расхождение.
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
      <div className='flex min-h-7 flex-wrap items-center gap-x-2.5 gap-y-1'>
        <Timer className='size-4 shrink-0 text-muted-foreground' />
        <p className='text-sm'>
          {/* Живая область только у неизменной части: иначе тикающий остаток
              переобъявлял бы окно целиком каждую секунду. */}
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

      {transaction.clashApiAdded === true && <ClashAPIAdded />}
    </div>
  );
}

/**
 * Секцию `experimental.clash_api` дописывает демон: без неё читать рантайм
 * нечем, и пользователю это показывается как чужая правка в его файле.
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

/** Шаг, на котором встал цикл, словами пользователя: новый код демона — ошибка компиляции здесь. */
const REASON_KEY: Readonly<Record<ApplyReasonCode, ParseKeys<'features/Config/ConfigApply'>>> = {
  backup_failed: 'failure.reason.backup_failed',
  write_failed: 'failure.reason.write_failed',
  restart_failed: 'failure.reason.restart_failed',
  healthcheck_failed: 'failure.reason.healthcheck_failed',
  dns_probe_failed: 'failure.reason.dns_probe_failed',
  interception_missing: 'failure.reason.interception_missing',
  rollback_failed: 'failure.reason.rollback_failed',
  no_backup: 'failure.reason.no_backup',
};

function ApplyFailure({ transaction, onDismiss }: { transaction: ApplyTransaction; onDismiss: () => void }) {
  const { t } = useTranslation('features/Config/ConfigApply');
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
      {/* Примитив ставит действие абсолютом в угол; на узком экране оно
          наезжает на заголовок, поэтому там уходит в поток. */}
      <AlertAction className='static col-start-2 mt-2 justify-self-start sm:absolute sm:mt-0'>
        <Button variant='ghost' size='sm' onClick={onDismiss}>
          {t('failure.dismiss')}
        </Button>
      </AlertAction>
    </Alert>
  );
}
