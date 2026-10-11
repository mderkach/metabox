import i18next from 'i18next';
import { memo } from 'react';

import type { LogEntry, LogLevel } from '@entities/Log';
import { cn } from '@shared/lib/utils';

import { LOGS_COLUMN } from './LogsColumns';

/** Уровень своим тоном шкалы `--log-*`: соседние уровни различимы. Новый уровень — ошибка компиляции здесь. */
const LEVEL_TONE: Readonly<Record<LogLevel, string>> = {
  trace: 'text-log-trace',
  debug: 'text-log-debug',
  info: 'text-log-info',
  notice: 'text-log-notice',
  warn: 'text-log-warn',
  error: 'text-log-error',
  fatal: 'font-bold text-log-error',
  panic: 'font-bold text-log-error',
};

const TIME_PARTS = {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
} as const satisfies Intl.DateTimeFormatOptions;

/** До секунды: строки одной минуты иначе не различить. Дата — в подсказке, лог читают за последние часы. */
function formatLogTime(at: Date): string {
  return at.toLocaleTimeString(i18next.language, TIME_PARTS);
}

function LogsRowProto({ entry, rowIndex }: { entry: LogEntry; rowIndex: number }) {
  return (
    <div role='row' aria-rowindex={rowIndex} className={LOGS_COLUMN.Row}>
      <span role='cell' className={LOGS_COLUMN.Time}>
        {entry.time !== null && (
          <time dateTime={entry.time.toISOString()} title={entry.time.toLocaleString(i18next.language)}>
            {formatLogTime(entry.time)}
          </time>
        )}
      </span>
      <span role='cell' className={cn(LOGS_COLUMN.Level, entry.level !== null && LEVEL_TONE[entry.level])}>
        {entry.level}
      </span>
      <span role='cell' className={LOGS_COLUMN.Message}>
        {entry.message}
      </span>
    </div>
  );
}

export const LogsRow = memo(LogsRowProto);
