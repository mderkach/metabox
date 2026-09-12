import type { AxiosRequestConfig } from 'axios';

import { ApiClientInstance } from '@shared/api';

import type { ServiceAction } from '../model/Daemon.model';
import { DAEMON_ENDPOINT } from './Daemon.endpoints';

/**
 * Ответы отдаются как есть: разбирают их схемы в фабриках опций, и в кэш Query
 * ложится модель. Преобразований здесь нет (Query.md).
 */
export async function getDaemonStatus(config?: AxiosRequestConfig): Promise<unknown> {
  return ApiClientInstance.get<unknown>(DAEMON_ENDPOINT.status(), config);
}

export async function getServiceState(config?: AxiosRequestConfig): Promise<unknown> {
  return ApiClientInstance.get<unknown>(DAEMON_ENDPOINT.service(), config);
}

/**
 * Действие над сервисом. Ответ — новое состояние: перечитывать его отдельным
 * запросом незачем, а гадать по коду ответа нельзя.
 */
export async function runServiceAction(action: ServiceAction): Promise<unknown> {
  return ApiClientInstance.post<unknown>(DAEMON_ENDPOINT.serviceAction(action));
}

/** Режим маршрутизации рантайма: `Rule`, `Global` или `Direct`. */
export async function getClashConfigs(config?: AxiosRequestConfig): Promise<unknown> {
  return ApiClientInstance.get<unknown>(DAEMON_ENDPOINT.clashConfigs(), config);
}
