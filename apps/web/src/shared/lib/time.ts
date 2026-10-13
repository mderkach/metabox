/**
 * Time units. Everything that converts some units to others takes its coefficients
 * from here: `1000`, `60` and `24` used to live as copies in six modules, and each
 * copy read as an independent decision.
 *
 * Only conversion coefficients here. Thresholds and periods — the polling interval,
 * the request timeout, the plausible-delta window — are settings of their own modules and
 * are declared there, but expressed through these units.
 */
export const MS_IN_SECOND = 1000;
export const SECONDS_IN_MINUTE = 60;
export const MINUTES_IN_HOUR = 60;
export const HOURS_IN_DAY = 24;
export const DAYS_IN_WEEK = 7;

export const SECONDS_IN_HOUR = SECONDS_IN_MINUTE * MINUTES_IN_HOUR;

export const MS_IN_MINUTE = MS_IN_SECOND * SECONDS_IN_MINUTE;
export const MS_IN_HOUR = MS_IN_MINUTE * MINUTES_IN_HOUR;
export const MS_IN_DAY = MS_IN_HOUR * HOURS_IN_DAY;
export const MS_IN_WEEK = MS_IN_DAY * DAYS_IN_WEEK;

/** Go returns `time.Duration` in nanoseconds; the panel uses seconds. */
export const NS_IN_SECOND = 1_000_000_000;
export const US_IN_SECOND = 1_000_000;
