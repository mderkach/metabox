import { MS_IN_SECOND } from '../lib/time';

const RECONNECT_MAX_SECONDS = 30;
const RECONNECT_GROWTH = 2;

/**
 * Retry of a stream that the daemon refused or that broke for good: the delay
 * doubles from `FirstDelay` to `MaxDelay`, and after `Attempts` failures in a
 * row a screen-bound stream waits for a manual reconnect. A stream limit
 * refusal clears when someone else's stream closes, while a log unavailable
 * for a minute will not come back without the router owner.
 */
export const STREAM_RECONNECT = {
  FirstDelay: MS_IN_SECOND,
  MaxDelay: RECONNECT_MAX_SECONDS * MS_IN_SECOND,
  Attempts: 6,
} as const;

/** Pause before the retry that follows `failures` failures in a row. */
export function reconnectDelay(failures: number): number {
  return Math.min(STREAM_RECONNECT.FirstDelay * RECONNECT_GROWTH ** failures, STREAM_RECONNECT.MaxDelay);
}
