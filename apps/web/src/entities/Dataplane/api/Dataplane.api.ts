import type { AxiosRequestConfig } from 'axios';

import type { ApplyTransactionWire } from '@entities/Daemon/@x/dataplane';
import { ApiClientInstance, type TaggedResponse } from '@shared/api';

import { DATAPLANE_ENDPOINT } from './Dataplane.endpoints';
import type { DataplaneChangeWire, DataplaneWire } from './Dataplane.schema';

/** `ETag` ответа — отпечаток секции UCI; уходит в `If-Match` смены. */
export async function getDataplane(config?: AxiosRequestConfig): Promise<TaggedResponse<DataplaneWire>> {
  return ApiClientInstance.getTagged<DataplaneWire>(DATAPLANE_ENDPOINT.dataplane(), config);
}

/**
 * Запускает смену модели. Ответ 202 приходит до конца цикла, как у Apply
 * конфига: запись, `reload` службы и окно подтверждения идут дальше. Без
 * `If-Match` демон отвечает 428, секция, изменившаяся после чтения, — 412.
 */
export async function putDataplane(change: DataplaneChangeWire, base: string | null): Promise<ApplyTransactionWire> {
  return ApiClientInstance.put<ApplyTransactionWire, DataplaneChangeWire>(DATAPLANE_ENDPOINT.dataplane(), change, {
    headers: base === null ? {} : { 'If-Match': base },
  });
}

export async function getDataplaneApplyState(id: string, config?: AxiosRequestConfig): Promise<ApplyTransactionWire> {
  return ApiClientInstance.get<ApplyTransactionWire>(DATAPLANE_ENDPOINT.applyState(id), config);
}

/** Без подтверждения демон по окну вернёт прежнюю модель. */
export async function confirmDataplane(id: string): Promise<ApplyTransactionWire> {
  return ApiClientInstance.post<ApplyTransactionWire>(DATAPLANE_ENDPOINT.applyConfirm(id));
}
