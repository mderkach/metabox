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
 * The logd ring is not cleared at all: with `logread`, clearing is only a mark
 * in daemon memory, and lines before it are not served until it restarts. The
 * `log.output` file the daemon also truncates.
 */
export async function clearLogs(config?: AxiosRequestConfig): Promise<LogsClearedWire> {
  return ApiClientInstance.post<LogsClearedWire>(LOG_ENDPOINT.clear(), undefined, config);
}
