import { FilePen, LoaderCircle } from 'lucide-react';
import { useMemo, useState, type TransitionEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { APPLY_PHASE } from '@entities/Daemon';
import { useNarrowScreen, useReducedMotion } from '@shared/lib/media';
import { cn } from '@shared/lib/utils';
import { Separator } from '@shared/ui';

import { useConfigApply } from '../lib/ConfigApply.lib';
import { useBarSpace } from '../lib/ConfigApply.space';
import { ConfigApplyBlocked } from './ConfigApplyBlocked';
import { ConfigApplyCheck } from './ConfigApplyCheck';
import { ConfigApplyConfirmWindow } from './ConfigApplyConfirmWindow';
import { ConfigApplyDiff } from './ConfigApplyDiff';
import { ConfigApplyDiscard } from './ConfigApplyDiscard';
import { ConfigApplyFailure } from './ConfigApplyFailure';
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
            <ConfigApplyConfirmWindow
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
            <ConfigApplyBlocked blocked={apply.blocked} onRetry={apply.retryLoad} />
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
            <ConfigApplyFailure
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
