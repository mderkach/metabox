import type { EntryWire, LogsWire } from '../api/Log.schema';
import { isLogLevel, type LogEntry, type LogTail } from './Log.model';

/** Метка, которую не разобрал `Date`, считается отсутствующей, а не ломает строку. */
function toTime(value: string | undefined): Date | null {
  if (value === undefined || value === '') {
    return null;
  }

  const time = new Date(value);

  return Number.isNaN(time.getTime()) ? null : time;
}

export function toLogEntry(wire: EntryWire): LogEntry {
  return {
    time: toTime(wire.time),
    level: wire.level !== undefined && isLogLevel(wire.level) ? wire.level : null,
    message: wire.message,
  };
}

export function toLogTail(wire: LogsWire): LogTail {
  return {
    source: wire.source,
    since: toTime(wire.since),
    entries: wire.entries.map(toLogEntry),
  };
}
