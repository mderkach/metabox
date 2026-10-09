import { LEVEL, SOURCE } from '../api/Log.schema';

export type LogLevel = (typeof LEVEL)[number];

export type LogSource = (typeof SOURCE)[number];

/** Уровни от подробного к аварийному: в этом порядке их перечисляет фильтр. */
export const LOG_LEVELS: readonly LogLevel[] = LEVEL;

/** Уровень экрана при первом заходе: `trace` и `debug` на живом роутере заливают хвост соединениями. */
export const DEFAULT_LOG_LEVEL: LogLevel = 'info';

/** Сколько строк хвоста просит экран. Потолок демона — 1000. */
export const LOG_TAIL_LINES = 200;

/**
 * Сколько строк держит экран — хвост и поток вместе. Старые выпадают: историю
 * глубже держит logd или файл лога, а не вкладка.
 */
export const LOG_LIMIT = 2000;

export const LOG_SOURCE = {
  Logread: 'logread',
  File: 'file',
} as const satisfies Record<string, LogSource>;

export interface LogEntry {
  /** `null` — метки у строки нет. До синхронизации NTP метки роутера в прошлом. */
  time: Date | null;
  /** `null` — уровень не разобран: продолжение многострочного сообщения, стек паники. */
  level: LogLevel | null;
  message: string;
}

export interface LogTail {
  /** Строка, а не `LogSource`: источник, которого панель не знает, показывается как пришёл. */
  source: string;
  /** Отметка последней очистки; `null` — очистки не было с запуска демона. */
  since: Date | null;
  entries: LogEntry[];
}

export function isLogLevel(value: string): value is LogLevel {
  return LEVEL.some((level) => level === value);
}

/** Строка потока с номером: по разрыву номеров видна потеря строк. */
export interface LogEvent {
  seq: number;
  entry: LogEntry;
}

/**
 * Состояние потока. `Closed` — демон отказал в потоке (лимит потоков, лог
 * недоступен) или соединение оборвалось без переподключения: `EventSource`
 * кода ответа не отдаёт, поэтому причину экран не различает.
 */
export const LOG_STREAM_STATUS = {
  Connecting: 'connecting',
  Open: 'open',
  Closed: 'closed',
} as const;

export type LogStreamStatus = (typeof LOG_STREAM_STATUS)[keyof typeof LOG_STREAM_STATUS];
