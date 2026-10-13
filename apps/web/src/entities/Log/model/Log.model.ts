import { LEVEL, SOURCE } from '../api/Log.schema';

export type LogLevel = (typeof LEVEL)[number];

export type LogSource = (typeof SOURCE)[number];

/** Levels from verbose to critical: the filter lists them in this order. */
export const LOG_LEVELS: readonly LogLevel[] = LEVEL;

/** Screen level on first visit: `trace` and `debug` on a live router flood the tail with connections. */
export const DEFAULT_LOG_LEVEL: LogLevel = 'info';

/** How many tail lines the screen asks for. The daemon ceiling is 1000. */
export const LOG_TAIL_LINES = 200;

/**
 * How many lines the screen keeps, tail and stream together. Old ones drop out:
 * deeper history is held by logd or the log file, not the tab.
 */
export const LOG_LIMIT = 2000;

export const LOG_SOURCE = {
  Logread: 'logread',
  File: 'file',
} as const satisfies Record<string, LogSource>;

export interface LogEntry {
  /** `null` means the line has no timestamp. Before NTP sync router timestamps are in the past. */
  time: Date | null;
  /** `null` means the level was not parsed: a continuation of a multi-line message, a panic stack. */
  level: LogLevel | null;
  message: string;
}

export interface LogTail {
  /** A string, not `LogSource`: a source the panel does not know is shown as it came. */
  source: string;
  /** Last clear mark; `null` means there has been no clear since the daemon started. */
  since: Date | null;
  entries: LogEntry[];
}

export function isLogLevel(value: string): value is LogLevel {
  return LEVEL.some((level) => level === value);
}

/** Stream line with a number: a gap in numbers shows lost lines. */
export interface LogEvent {
  seq: number;
  entry: LogEntry;
}

/**
 * Stream state. `Reconnecting` means the daemon refused the stream (stream
 * limit, log unavailable) or the connection broke without reconnecting, and the
 * screen waits for the next attempt. `Closed` means the attempts ran out, and
 * only manual from here. `EventSource` does not serve the response code, so the
 * screen cannot tell the cause.
 */
export const LOG_STREAM_STATUS = {
  Connecting: 'connecting',
  Open: 'open',
  Reconnecting: 'reconnecting',
  Closed: 'closed',
} as const;

export type LogStreamStatus = (typeof LOG_STREAM_STATUS)[keyof typeof LOG_STREAM_STATUS];

function isSameEntry(left: LogEntry, right: LogEntry): boolean {
  return (
    left.message === right.message &&
    left.level === right.level &&
    (left.time?.getTime() ?? null) === (right.time?.getTime() ?? null)
  );
}

function isSeam(tail: readonly LogEntry[], streamed: readonly LogEntry[], overlap: number): boolean {
  const start = tail.length - overlap;

  for (let index = 0; index < overlap; index += 1) {
    if (!isSameEntry(tail[start + index], streamed[index])) {
      return false;
    }
  }

  return true;
}

/**
 * Tail and stream lines as one list, without duplicates at the seam.
 *
 * The tail is requested after the stream opens, so its end may repeat the start
 * of the stream: lines that came through the stream while the request was
 * running. Tail lines have no numbers, and the seam is the longest match of the
 * tail end with the stream start. A line that sing-box repeated in the same
 * second cannot be told from a duplicate at the seam and is removed with it. If
 * more lines came through the stream before the tail response than the tail
 * holds, there is no seam, and the tail repeats entirely.
 */
export function mergeLogEntries(tail: readonly LogEntry[], streamed: readonly LogEntry[]): LogEntry[] {
  for (let overlap = Math.min(tail.length, streamed.length); overlap > 0; overlap -= 1) {
    if (isSeam(tail, streamed, overlap)) {
      return [...tail, ...streamed.slice(overlap)].slice(-LOG_LIMIT);
    }
  }

  return [...tail, ...streamed].slice(-LOG_LIMIT);
}
