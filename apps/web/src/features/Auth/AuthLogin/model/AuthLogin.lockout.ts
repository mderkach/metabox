import { SECONDS_IN_MINUTE } from '@shared/lib/time';

/**
 * Whole minutes left of a login lockout, rounded up: "0 minutes" would invite a retry the
 * daemon still refuses. `null` when the daemon did not say how long.
 */
export function lockoutMinutes(retryAfterSeconds: number | null): number | null {
  if (retryAfterSeconds === null) {
    return null;
  }

  return Math.max(1, Math.ceil(retryAfterSeconds / SECONDS_IN_MINUTE));
}
