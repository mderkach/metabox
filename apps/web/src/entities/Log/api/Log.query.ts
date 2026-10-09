import { queryOptions, useQuery } from '@tanstack/react-query';

import { CACHE_TIME, decodeResponse } from '@shared/api';

import { toLogTail } from '../model/Log.adapter';
import { LOG_TAIL_LINES, type LogLevel } from '../model/Log.model';
import { clearLogs, getLogs } from './Log.api';
import { LogsClearedSchema, LogsSchema, type LogsClearedWire } from './Log.schema';

export const LOG_QUERY = {
  all: ['log'] as const,
  tail: (level: LogLevel) => [...LOG_QUERY.all, 'tail', level] as const,
} as const;

/**
 * Хвост на момент открытия экрана; дальше строки идут потоком. Кэш живёт
 * секунду — ровно чтобы хвост из загрузчика маршрута дошёл до экрана без
 * второго запроса: хвост, взятый из кэша при возврате на экран, разошёлся бы с
 * потоком.
 */
export function getLogTailOptions(level: LogLevel) {
  return queryOptions({
    queryKey: LOG_QUERY.tail(level),
    queryFn: async (context) =>
      decodeResponse(LogsSchema, await getLogs({ lines: LOG_TAIL_LINES, level }, context), 'logs'),
    staleTime: CACHE_TIME.Second,
    gcTime: CACHE_TIME.Second,
    meta: { showError: true, errorMessageKey: 'source.logs' },
  });
}

export function useLogTail(level: LogLevel) {
  return useQuery({ ...getLogTailOptions(level), select: toLogTail });
}

export async function clearLogTail(): Promise<LogsClearedWire> {
  return decodeResponse(LogsClearedSchema, await clearLogs(), 'logs');
}
