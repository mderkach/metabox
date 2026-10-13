import { APPLY_PHASE } from './Daemon.model';

/**
 * Apply is still running: the config is being written or is waiting for connection confirmation.
 *
 * The rule lives in the slice that owns the transaction: in the daemon it is
 * `apply.Transaction.Active`, and a second copy on the frontend would silently
 * drift from it, while both the ban on a second apply and the polling of cycle
 * progress depend on it.
 */
export function isApplyActive(phase: string | undefined): boolean {
  return phase === APPLY_PHASE.Applying || phase === APPLY_PHASE.AwaitingConfirm;
}
