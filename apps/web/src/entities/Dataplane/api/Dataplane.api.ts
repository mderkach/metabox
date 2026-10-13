import type { AxiosRequestConfig } from 'axios';

import type { ApplyTransactionWire } from '@entities/Daemon/@x/dataplane';
import { ApiClientInstance, type TaggedResponse } from '@shared/api';

import { DATAPLANE_ENDPOINT } from './Dataplane.endpoints';
import type { DataplaneChangeWire, DataplaneWire } from './Dataplane.schema';

/** `ETag` of the response is the UCI section fingerprint; it goes into the change `If-Match`. */
export async function getDataplane(config?: AxiosRequestConfig): Promise<TaggedResponse<DataplaneWire>> {
  return ApiClientInstance.getTagged<DataplaneWire>(DATAPLANE_ENDPOINT.dataplane(), config);
}

/**
 * Starts a model change. The 202 response arrives before the end of the cycle,
 * as for config Apply: the write, the service `reload` and the confirmation
 * window continue. Without `If-Match` the daemon answers 428, and for a section
 * changed after reading, 412.
 */
export async function putDataplane(change: DataplaneChangeWire, base: string | null): Promise<ApplyTransactionWire> {
  return ApiClientInstance.put<ApplyTransactionWire, DataplaneChangeWire>(DATAPLANE_ENDPOINT.dataplane(), change, {
    headers: base === null ? {} : { 'If-Match': base },
  });
}

export async function getDataplaneApplyState(id: string, config?: AxiosRequestConfig): Promise<ApplyTransactionWire> {
  return ApiClientInstance.get<ApplyTransactionWire>(DATAPLANE_ENDPOINT.applyState(id), config);
}

/** Without confirmation the daemon returns the previous model when the window expires. */
export async function confirmDataplane(id: string): Promise<ApplyTransactionWire> {
  return ApiClientInstance.post<ApplyTransactionWire>(DATAPLANE_ENDPOINT.applyConfirm(id));
}
