import { HOURS_IN_DAY, MINUTES_IN_HOUR, MS_IN_SECOND, SECONDS_IN_MINUTE } from '../lib/time';

const SECOND = MS_IN_SECOND;
const MINUTE = SECONDS_IN_MINUTE * SECOND;
const HOUR = MINUTES_IN_HOUR * MINUTE;

/** Ступени кэша. Клиент по умолчанию не кэширует — время задаётся осознанно. */
export const CACHE_TIME = {
  Second: SECOND,
  Minute: MINUTE,
  Hour: HOUR,
  Day: HOURS_IN_DAY * HOUR,
} as const;

const REQUEST_TIMEOUT_SECONDS = 15;
/** Замер задержки идёт внутри запроса к демону и обязан уложиться в его потолок. */
const PROBE_TIMEOUT_SECONDS = 5;

/** Потолки ожидания. Свой таймаут у запроса нужен всегда: у `fetch` его нет, и зависший демон держал бы запрос до закрытия вкладки. */
export const TIMEOUT = {
  /** Полный цикл Apply укладывается в 15 секунд — дольше уже отказ. */
  Request: REQUEST_TIMEOUT_SECONDS * SECOND,
  /** Сколько Clash API ждёт ответа узла при замере задержки. */
  Probe: PROBE_TIMEOUT_SECONDS * SECOND,
} as const;

const STATUS_POLL_SECONDS = 5;
/** Шаг истории на демоне — десять секунд; чаще спрашивать нечего. */
const HISTORY_POLL_SECONDS = 10;

/** Периоды опроса. Интервал живёт рядом с фабрикой ключа, а не в хуке. */
export const POLL_INTERVAL = {
  Status: STATUS_POLL_SECONDS * SECOND,
  /** Окно подтверждения — минута, и отсчёт обязан идти заметно чаще. */
  Apply: SECOND,
  History: HISTORY_POLL_SECONDS * SECOND,
} as const;
