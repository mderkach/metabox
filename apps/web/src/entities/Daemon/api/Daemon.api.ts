import type { AxiosRequestConfig } from 'axios';

import { ApiClientInstance } from '@shared/api';

import type { ServiceAction } from '../model/Daemon.model';
import { DAEMON_ENDPOINT } from './Daemon.endpoints';
import type { ClashConfigsWire, DaemonStatusWire, ServiceStateWire, TrafficHistoryWire } from './Daemon.schema';

export async function getDaemonStatus(config?: AxiosRequestConfig): Promise<DaemonStatusWire> {
  return ApiClientInstance.get<DaemonStatusWire>(DAEMON_ENDPOINT.status(), config);
}

export async function getTrafficHistory(config?: AxiosRequestConfig): Promise<TrafficHistoryWire> {
  return ApiClientInstance.get<TrafficHistoryWire>(DAEMON_ENDPOINT.history(), config);
}

export async function getServiceState(config?: AxiosRequestConfig): Promise<ServiceStateWire> {
  return ApiClientInstance.get<ServiceStateWire>(DAEMON_ENDPOINT.service(), config);
}

/**
 * Action on the service. The response is the new state: there is no need to
 * reread it with a separate query, and one must not guess from the response
 * code.
 */
export async function runServiceAction(action: ServiceAction): Promise<ServiceStateWire> {
  return ApiClientInstance.post<ServiceStateWire>(DAEMON_ENDPOINT.serviceAction(action));
}

/** Runtime routing mode: `Rule`, `Global` or `Direct`. */
export async function getClashConfigs(config?: AxiosRequestConfig): Promise<ClashConfigsWire> {
  return ApiClientInstance.get<ClashConfigsWire>(DAEMON_ENDPOINT.clashConfigs(), config);
}

/**
 * A mode change goes to the runtime, not to the config: the file does not
 * change, and after a restart the mode returns to `default_mode` unless
 * `cache_file` is enabled. sing-box silently skips an unknown mode and still
 * answers 204, so the accepted mode is visible only on the next read.
 */
export async function setClashMode(mode: string): Promise<void> {
  return ApiClientInstance.patch<void>(DAEMON_ENDPOINT.clashConfigs(), { mode });
}
