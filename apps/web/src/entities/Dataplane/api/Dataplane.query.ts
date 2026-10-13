import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  ApplyTransactionSchema,
  getDaemonStatusOptions,
  isApplyActive,
  toApplyTransaction,
  type ApplyTransactionWire,
} from '@entities/Daemon/@x/dataplane';
import { CACHE_TIME, POLL_INTERVAL, decodeResponse } from '@shared/api';

import { toDataplane, toDataplaneChange } from '../model/Dataplane.adapter';
import type { DataplaneModel } from '../model/Dataplane.model';
import { confirmDataplane, getDataplane, getDataplaneApplyState, putDataplane } from './Dataplane.api';
import { DATAPLANE_ENDPOINT } from './Dataplane.endpoints';
import { DataplaneSchema } from './Dataplane.schema';

export const DATAPLANE_QUERY = {
  all: ['dataplane'] as const,
  model: () => [...DATAPLANE_QUERY.all, 'model'] as const,
  apply: (id: string) => [...DATAPLANE_QUERY.all, 'apply', id] as const,
} as const;

/** Each request runs `uci` and `nft` on the router, and the model changes only by a change through the panel or SSH. */
export function getDataplaneOptions() {
  return queryOptions({
    queryKey: DATAPLANE_QUERY.model(),
    queryFn: async function fetchDataplane(context) {
      const { body, etag } = await getDataplane(context);

      return { body: decodeResponse(DataplaneSchema, body, 'dataplane'), etag };
    },
    staleTime: CACHE_TIME.Minute,
    gcTime: CACHE_TIME.Hour,
    meta: { showError: true, errorMessageKey: 'source.dataplane' },
  });
}

export function useDataplane() {
  return useQuery({ ...getDataplaneOptions(), select: toDataplane });
}

export function getDataplaneApplyStateOptions(id: string) {
  return queryOptions({
    queryKey: DATAPLANE_QUERY.apply(id),
    queryFn: async function fetchDataplaneApplyState({ signal }) {
      return decodeResponse(ApplyTransactionSchema, await getDataplaneApplyState(id, { signal }), 'dataplane apply');
    },
    staleTime: 0,
    gcTime: CACHE_TIME.Minute,
    refetchInterval: (query) => (isApplyActive(query.state.data?.phase) ? POLL_INTERVAL.Apply : false),
    // The change progress is shown by the screen block, while a polling miss every second would flood it with toasts.
    meta: { showError: false },
  });
}

/** Model change progress. `null` means there were no changes, and the query is not created. */
export function useDataplaneTransaction(id: string | null) {
  return useQuery({
    ...getDataplaneApplyStateOptions(id ?? ''),
    enabled: id !== null,
    select: toApplyTransaction,
  });
}

/**
 * Puts the change transaction into the cache: into its state and into the
 * daemon status. The screen takes the identifier from the status, so the window
 * survives a page reload, while polling the status every five seconds would
 * show the window late.
 */
export function useSaveDataplaneTransaction() {
  const queryClient = useQueryClient();

  return (transaction: ApplyTransactionWire) => {
    queryClient.setQueryData(getDataplaneApplyStateOptions(transaction.id).queryKey, transaction);

    queryClient.setQueryData(getDaemonStatusOptions().queryKey, (status) =>
      status === undefined
        ? status
        : {
            ...status,
            dataplane_transaction: transaction,
            dataplane_transaction_href: DATAPLANE_ENDPOINT.applyState(transaction.id),
          }
    );
  };
}

export interface DataplaneChange {
  model: DataplaneModel;
  /** `Dataplane.etag` of the model the change was built from. */
  base: string | null;
}

/** The model is written entirely: the daemon reads a missing field as zero, not "leave as is". */
export async function changeDataplane({ model, base }: DataplaneChange): Promise<ApplyTransactionWire> {
  return decodeResponse(ApplyTransactionSchema, await putDataplane(toDataplaneChange(model), base), 'dataplane apply');
}

export async function confirmDataplaneChange(id: string): Promise<ApplyTransactionWire> {
  return decodeResponse(ApplyTransactionSchema, await confirmDataplane(id), 'dataplane apply');
}
