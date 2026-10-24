import type { ParseKeys } from 'i18next';
import { CircleAlert, FilePen, Info, LoaderCircle, Timer } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type TransitionEvent } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { APPLY_PHASE, type ApplyReasonCode, type ApplyTransaction } from '@entities/Daemon';
import { useNarrowScreen, useReducedMotion } from '@shared/lib/media';
import { NS_IN_SECOND } from '@shared/lib/time';
import { useCountdown } from '@shared/lib/useCountdown';
import { cn } from '@shared/lib/utils';
import { Alert, AlertAction, AlertDescription, AlertTitle, Button, Separator } from '@shared/ui';

import { useConfigApply } from '../lib/ConfigApply.lib';
import { ConfigApplyBlocked } from './ConfigApplyBlocked';
import { ConfigApplyCheck } from './ConfigApplyCheck';
import { ConfigApplyDiff } from './ConfigApplyDiff';
import { ConfigApplyDiscard } from './ConfigApplyDiscard';
import { ConfigApplyStale } from './ConfigApplyStale';
import { ConfigApplyWorkdir } from './ConfigApplyWorkdir';

/**
 * The bar lives in the shell, not on the editor screen: unapplied edits and the
 * confirmation window are visible from any screen and survive a transition
 * between them.
 *
 * The bar floats over the bottom edge of the screen and does not move the
 * layout. The screen frees the space under it itself: `onSpaceChange` reports
 * the height the bar covers while visible, and zero when it is gone.
 */
export function ConfigApplyBar({ onSpaceChange }: { onSpaceChange: (space: number) => void }) {
  const { t } = useTranslation('features/Config/ConfigApply');
  const apply = useConfigApply();
  const [dismissed, setDismissed] = useState<string | null>(null);
  const phase = apply.transaction?.phase;
  const awaiting = phase === APPLY_PHASE.AwaitingConfirm;
  // Rollback and failure are shown without a draft too: a version rollback from
  // the history does not create a draft of its own. The user hides the message,
  // otherwise it would vanish before being read.
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
  // The leaving bar collapses with the text it was seen with: a fresher state
  // during collapsing would replace, for example, the confirmation window with
  // the "edits in draft" line.
  const [held, setHeld] = useState<typeof current | null>(null);
  const reducedMotion = useReducedMotion();
  const narrow = useNarrowScreen();

  if (visible && held !== current) {
    setHeld(current);
  }

  // Without animation `transitionend` will not arrive, and the snapshot would
  // stay in the DOM together with the ticking confirmation window timer.
  if (!visible && reducedMotion && held !== null) {
    setHeld(null);
  }

  const shown = visible ? current : held;
  const layerRef = useBarSpace(visible || held !== null, onSpaceChange);

  function dropHeld(event: TransitionEvent<HTMLDivElement>) {
    if (!visible && event.target === event.currentTarget && event.propertyName === 'translate') {
      setHeld(null);
    }
  }

  // Below `md` the bottom navigation bar stands under the bar, and the safe
  // bottom inset is already behind it; on a wide screen the bar itself sits at
  // the bottom edge. The transition group name keeps the bar above the screen
  // while the router changes the screen.
  return (
    <div
      ref={layerRef}
      data-slot='apply-bar'
      inert={!visible}
      aria-hidden={!visible}
      onTransitionEnd={dropHeld}
      className={cn(
        'absolute inset-x-0 bottom-0 z-10 flex justify-center px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-[opacity,translate] ease-(--motion-ease-out) [view-transition-name:apply-bar] motion-reduce:transition-none max-md:pb-3',
        visible
          ? 'translate-y-0 opacity-100 duration-(--motion-enter)'
          : 'translate-y-3 opacity-0 duration-(--motion-exit)'
      )}
    >
      {shown !== null && (
        <section
          aria-label={t('bar.label')}
          className='flex max-h-[60svh] w-full max-w-4xl flex-col gap-2 overflow-y-auto rounded-xl bg-popover px-4 py-2.5 text-popover-foreground shadow-lg ring-1 ring-foreground/10'
        >
          {shown.awaiting && shown.transaction !== null ? (
            <ConfirmWindow
              key={shown.transaction.id}
              transaction={shown.transaction}
              isConfirming={apply.isConfirming}
              onConfirm={apply.confirm}
            />
          ) : (
            <div className='flex min-h-7 items-center gap-2.5'>
              {shown.isApplying ? (
                <LoaderCircle className='size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none' />
              ) : (
                <FilePen className='size-4 shrink-0 text-muted-foreground max-sm:hidden' />
              )}
              <p className='min-w-0 flex-1 text-sm'>{shown.isApplying ? t('bar.applying') : t('bar.dirty')}</p>
              {/* Discard is kept at the group edge, away from "Apply": a
                    miss on the neighboring button would open discard instead of
                    apply. */}
              {!shown.isApplying && (
                <>
                  <ConfigApplyDiscard compact={narrow} onDiscard={apply.discard} />
                  {!narrow && <Separator orientation='vertical' className='mx-1.5 h-5' />}
                  <ConfigApplyDiff canApply={apply.canApply} blocked={apply.blocked} onApply={apply.apply} />
                </>
              )}
            </div>
          )}

          {!shown.isApplying && !shown.awaiting && apply.blocked !== null && (
            <ConfigApplyBlocked blocked={apply.blocked} />
          )}

          {apply.unsent && !shown.isApplying && (
            <p role='status' className='text-xs text-destructive'>
              {t('unsent')}
            </p>
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
  );
}

/**
 * Height of the bar layer while it takes space, visible or still sliding away.
 * The space under a leaving bar is held until the end of the slide, otherwise
 * the screen bottom would jump under it. It is measured by an observer, not
 * once: `sing-box check` output, a failure and the confirmation window change
 * the bar height in place.
 */
function useBarSpace(visible: boolean, onSpaceChange: (space: number) => void) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(
    function reportBarSpace() {
      const layer = ref.current;

      if (!visible || layer === null) {
        onSpaceChange(0);

        return;
      }

      const observer = new ResizeObserver(function measureBar() {
        onSpaceChange(layer.offsetHeight);
      });

      observer.observe(layer);

      return function stopMeasuringBar() {
        observer.disconnect();
      };
    },
    [visible, onSpaceChange]
  );

  return ref;
}

/**
 * The remainder comes from the daemon, which counts it with a monotonic clock
 * because the router has no real-time clock, while the browser only ticks
 * between responses: nothing happens at zero here, the daemon does the
 * rollback. Each poll response resyncs the countdown, so a `setInterval`
 * throttled in a background tab does not accumulate drift.
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

      {transaction.clashApiAdded === true && <ClashAPIAdded />}
    </div>
  );
}

/**
 * The `experimental.clash_api` section is appended by the daemon: without it
 * there is nothing to read the runtime with, and the user is shown this as
 * someone else's edit in their file.
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

/** The step the cycle stopped at, in the user's words: a new daemon code is a compile error here. */
const REASON_KEY: Readonly<Record<ApplyReasonCode, ParseKeys<'features/Config/ConfigApply'>>> = {
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
      {/* The primitive places the action absolutely in the corner; on a
          narrow screen it overlaps the title, so there it goes into the flow.
          */}
      <AlertAction className='static col-start-2 mt-2 justify-self-start sm:absolute sm:mt-0'>
        <Button variant='ghost' size='sm' onClick={onDismiss}>
          {t('failure.dismiss')}
        </Button>
      </AlertAction>
    </Alert>
  );
}
