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

/** Каждый запрос запускает на роутере `uci` и `nft`, а модель меняется только сменой через панель или SSH. */
export function getDataplaneOptions() {
  return queryOptions({
    queryKey: DATAPLANE_QUERY.model(),
    queryFn: async (context) => decodeResponse(DataplaneSchema, await getDataplane(context), 'dataplane'),
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
    // Ход смены показывает блок экрана, а промах опроса раз в секунду завалил бы его тостами.
    meta: { showError: false },
  });
}

/** Ход смены модели. `null` — смен не было, запрос не заводится. */
export function useDataplaneTransaction(id: string | null) {
  return useQuery({
    ...getDataplaneApplyStateOptions(id ?? ''),
    enabled: id !== null,
    select: toApplyTransaction,
  });
}

/**
 * Кладёт транзакцию смены в кэш: в её состояние и в статус демона. Идентификатор
 * экран берёт из статуса — так окно переживает перезагрузку страницы, — а
 * опрос статуса раз в пять секунд показал бы окно с опозданием.
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

/** Модель пишется целиком: демон читает отсутствующее поле нулём, а не «оставить как есть». */
export async function changeDataplane(model: DataplaneModel): Promise<ApplyTransactionWire> {
  return decodeResponse(ApplyTransactionSchema, await putDataplane(toDataplaneChange(model)), 'dataplane apply');
}

export async function confirmDataplaneChange(id: string): Promise<ApplyTransactionWire> {
  return decodeResponse(ApplyTransactionSchema, await confirmDataplane(id), 'dataplane apply');
}
