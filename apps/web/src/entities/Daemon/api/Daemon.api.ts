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
 * Действие над сервисом. Ответ — новое состояние: перечитывать его отдельным
 * запросом незачем, а гадать по коду ответа нельзя.
 */
export async function runServiceAction(action: ServiceAction): Promise<ServiceStateWire> {
  return ApiClientInstance.post<ServiceStateWire>(DAEMON_ENDPOINT.serviceAction(action));
}

/** Режим маршрутизации рантайма: `Rule`, `Global` или `Direct`. */
export async function getClashConfigs(config?: AxiosRequestConfig): Promise<ClashConfigsWire> {
  return ApiClientInstance.get<ClashConfigsWire>(DAEMON_ENDPOINT.clashConfigs(), config);
}

/**
 * Смена режима идёт в рантайм, а не в конфиг: файл не меняется, и после
 * рестарта режим вернётся к `default_mode`, если `cache_file` не включён.
 * Незнакомый режим sing-box молча пропускает и всё равно отвечает 204,
 * поэтому принятый режим видно только по следующему чтению.
 */
export async function setClashMode(mode: string): Promise<void> {
  return ApiClientInstance.patch<void>(DAEMON_ENDPOINT.clashConfigs(), { mode });
}
