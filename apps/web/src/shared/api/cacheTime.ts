import { HOURS_IN_DAY, MINUTES_IN_HOUR, MS_IN_SECOND, SECONDS_IN_MINUTE } from '../lib/time';

const SECOND = MS_IN_SECOND;
const MINUTE = SECONDS_IN_MINUTE * SECOND;
const HOUR = MINUTES_IN_HOUR * MINUTE;

/** Cache tiers. The client does not cache by default — time is set deliberately. */
export const CACHE_TIME = {
  Second: SECOND,
  Minute: MINUTE,
  Hour: HOUR,
  Day: HOURS_IN_DAY * HOUR,
} as const;

const REQUEST_TIMEOUT_SECONDS = 15;
/** A latency measurement runs inside the daemon request and must fit under its ceiling. */
const PROBE_TIMEOUT_SECONDS = 5;

/** Wait ceilings. A request always needs its own timeout: `fetch` has none, and a hung daemon would hold the request until the tab closes. */
export const TIMEOUT = {
  /** A full Apply cycle fits in 15 seconds — longer is already a failure. */
  Request: REQUEST_TIMEOUT_SECONDS * SECOND,
  /** How long Clash API waits for a node's response when measuring latency. */
  Probe: PROBE_TIMEOUT_SECONDS * SECOND,
} as const;

const STATUS_POLL_SECONDS = 5;
/** The history step on the daemon is ten seconds; there is nothing to ask more often. */
const HISTORY_POLL_SECONDS = 10;

/** Polling periods. The interval lives next to the key factory, not in a hook. */
export const POLL_INTERVAL = {
  Status: STATUS_POLL_SECONDS * SECOND,
  /** The confirmation window is a minute, and the countdown must tick noticeably more often. */
  Apply: SECOND,
  History: HISTORY_POLL_SECONDS * SECOND,
} as const;
