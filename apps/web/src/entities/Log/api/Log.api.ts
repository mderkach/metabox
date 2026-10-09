import type { AxiosRequestConfig } from 'axios';

import { ApiClientInstance } from '@shared/api';

import { LOG_ENDPOINT } from './Log.endpoints';
import type { LogsClearedWire, LogsWire } from './Log.schema';

export async function getLogs(
  params: { lines: number; level: string },
  config?: AxiosRequestConfig
): Promise<LogsWire> {
  return ApiClientInstance.get<LogsWire>(LOG_ENDPOINT.logs(), { ...config, params });
}

/**
 * Кольцо logd не чистится вовсе: при `logread` очистка — только отметка в
 * памяти демона, строки раньше неё не отдаются до его перезапуска. Файл
 * `log.output` демон ещё и усекает.
 */
export async function clearLogs(config?: AxiosRequestConfig): Promise<LogsClearedWire> {
  return ApiClientInstance.post<LogsClearedWire>(LOG_ENDPOINT.clear(), undefined, config);
}
