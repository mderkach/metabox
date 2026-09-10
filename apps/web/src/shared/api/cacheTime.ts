const MS_IN_SECOND = 1000;
const SECONDS_IN_MINUTE = 60;
const MINUTES_IN_HOUR = 60;

const SECOND = MS_IN_SECOND;
const MINUTE = SECONDS_IN_MINUTE * SECOND;

/** Ступени кэша. Клиент по умолчанию не кэширует — время задаётся осознанно. */
export const CACHE_TIME = {
  Second: SECOND,
  Minute: MINUTE,
  Hour: MINUTES_IN_HOUR * MINUTE,
} as const;

const STATUS_POLL_SECONDS = 5;

/** Периоды опроса. Интервал живёт рядом с фабрикой ключа, а не в хуке. */
export const POLL_INTERVAL = {
  Status: STATUS_POLL_SECONDS * SECOND,
} as const;
