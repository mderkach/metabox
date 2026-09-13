import { MINUTES_IN_HOUR, MS_IN_SECOND, SECONDS_IN_MINUTE } from '../lib/time';

const SECOND = MS_IN_SECOND;
const MINUTE = SECONDS_IN_MINUTE * SECOND;

/** Ступени кэша. Клиент по умолчанию не кэширует — время задаётся осознанно. */
export const CACHE_TIME = {
  Second: SECOND,
  Minute: MINUTE,
  Hour: MINUTES_IN_HOUR * MINUTE,
} as const;

const STATUS_POLL_SECONDS = 5;
/** Шаг истории на демоне — десять секунд; чаще спрашивать нечего. */
const HISTORY_POLL_SECONDS = 10;

/** Периоды опроса. Интервал живёт рядом с фабрикой ключа, а не в хуке. */
export const POLL_INTERVAL = {
  Status: STATUS_POLL_SECONDS * SECOND,
  /** Окно подтверждения — минута (NFR-5), и отсчёт обязан идти заметно чаще. */
  Apply: SECOND,
  History: HISTORY_POLL_SECONDS * SECOND,
} as const;
