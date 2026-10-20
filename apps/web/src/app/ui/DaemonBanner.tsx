import { CircleAlert, Unplug } from 'lucide-react';
import { useState, type TransitionEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { useDaemonReachable, useDaemonStatus } from '@entities/Daemon';
import { API_FAILURE, ApiError } from '@shared/api';
import { useReducedMotion } from '@shared/lib/media';
import { cn } from '@shared/lib/utils';
import { Button } from '@shared/ui';

/**
 * Daemon unavailable strip. It lives in the shell because the failure concerns
 * all screens, not one: duplicating it on every screen would show the user
 * several different messages about one problem (Query.md). It sits in the
 * content column above the screen, not above the whole panel: the sidebar works
 * without the daemon, since navigation, theme and language do not depend on it.
 *
 * "Service is down" does not appear here: the daemon reports a stopped sing-box
 * in a response, and that is a screen state, not a panel failure.
 *
 * A response that is not understood is shown here too: an empty panel without a
 * message looks healthy.
 */
export function DaemonBanner() {
  const { t } = useTranslation('app');
  const status = useDaemonStatus();
  const reachable = useDaemonReachable();
  const reducedMotion = useReducedMotion();
  const unreachable = status.error instanceof ApiError && status.error.kind === API_FAILURE.Unreachable;
  const message = unreachable ? 'banner.unreachable' : 'banner.schema';
  // The leaving strip collapses with the text it was seen with: after the
  // daemon responds there is no error, and the schema would flash instead of
  // "not responding".
  const [held, setHeld] = useState<typeof message | null>(null);

  if (!reachable && held !== message) {
    setHeld(message);
  }

  // The text is cleared once the strip has collapsed: the next failure inserts
  // it into the live region again. Not all screen readers announce removal of
  // `aria-hidden` from a ready node, while all announce an insertion. Without
  // animation `transitionend` will not arrive.
  if (reachable && reducedMotion && held !== null) {
    setHeld(null);
  }

  function dropHeld(event: TransitionEvent<HTMLDivElement>) {
    if (reachable && event.target === event.currentTarget) {
      setHeld(null);
    }
  }

  // Height is animated by CSS: the screen under the strip is the named group
  // `page`, outside a router transition it is not animated, and a
  // `<ViewTransition>` boundary would leave it jumping. The live region stays
  // in the DOM permanently, otherwise its first message would not be announced.
  return (
    <div
      role='status'
      onTransitionEnd={dropHeld}
      className={cn(
        'grid shrink-0 transition-[grid-template-rows] duration-(--view-transition-panel) ease-(--view-transition-ease) motion-reduce:transition-none',
        reachable ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'
      )}
    >
      <div inert={reachable} aria-hidden={reachable} className='min-h-0 overflow-hidden'>
        {held !== null && (
          <div className='border-b border-destructive/20 bg-destructive/10 px-4 py-2.5 sm:px-6'>
            <div className='flex min-h-7 items-center gap-2.5 text-sm text-destructive'>
              {held === 'banner.unreachable' ? (
                <Unplug className='size-4 shrink-0' />
              ) : (
                <CircleAlert className='size-4 shrink-0' />
              )}
              <p className='min-w-0 flex-1'>{t(held)}</p>
              <Button
                variant='ghost'
                size='sm'
                disabled={status.isFetching}
                className='shrink-0 text-destructive hover:text-destructive'
                onClick={() => {
                  void status.refetch();
                }}
              >
                {t(status.isFetching ? 'source.retrying' : 'source.retry', { ns: 'shared' })}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
