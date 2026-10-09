import type { AxiosRequestConfig } from 'axios';

import type { ApplyTransactionWire } from '@entities/Daemon/@x/dataplane';
import { ApiClientInstance } from '@shared/api';

import { DATAPLANE_ENDPOINT } from './Dataplane.endpoints';
import type { DataplaneChangeWire, DataplaneWire } from './Dataplane.schema';

export async function getDataplane(config?: AxiosRequestConfig): Promise<DataplaneWire> {
  return ApiClientInstance.get<DataplaneWire>(DATAPLANE_ENDPOINT.dataplane(), config);
}

/**
 * Запускает смену модели. Ответ 202 приходит до конца цикла, как у Apply
 * конфига: запись, `reload` службы и окно подтверждения идут дальше.
 */
export async function putDataplane(change: DataplaneChangeWire): Promise<ApplyTransactionWire> {
  return ApiClientInstance.put<ApplyTransactionWire, DataplaneChangeWire>(DATAPLANE_ENDPOINT.dataplane(), change);
}

export async function getDataplaneApplyState(id: string, config?: AxiosRequestConfig): Promise<ApplyTransactionWire> {
  return ApiClientInstance.get<ApplyTransactionWire>(DATAPLANE_ENDPOINT.applyState(id), config);
}

/** Без подтверждения демон по окну вернёт прежнюю модель. */
export async function confirmDataplane(id: string): Promise<ApplyTransactionWire> {
  return ApiClientInstance.post<ApplyTransactionWire>(DATAPLANE_ENDPOINT.applyConfirm(id));
}
