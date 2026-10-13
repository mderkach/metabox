import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

import { APPLY_PHASE, isApplyActive, useDaemonStatus, type ApplyTransaction } from '@entities/Daemon';
import {
  DATAPLANE_QUERY,
  useDataplane,
  useDataplaneTransaction,
  withDeviceRoute,
  type DataplaneModel,
  type RouteSource,
} from '@entities/Dataplane';

import { useChangeDeviceRoute, useConfirmDeviceRoute } from '../api';

/**
 * Rereads the model when the change left the write: in the confirmation window
 * UCI already holds the new model, after a rollback the previous one again, and
 * the toggles must show what is on the device.
 */
function useModelRefresh(transaction: ApplyTransaction | null) {
  const queryClient = useQueryClient();
  const seen = useRef<string | null>(null);

  useEffect(
    function refreshModel() {
      if (transaction === null || transaction.phase === APPLY_PHASE.Applying) return;

      const mark = `${transaction.id}:${transaction.phase}`;

      if (seen.current === mark) return;

      seen.current = mark;

      void queryClient.invalidateQueries({ queryKey: DATAPLANE_QUERY.model() });
    },
    [transaction, queryClient]
  );
}

export interface DeviceRouteState {
  /** `null` means the model was not read, and there is nothing to write it from. */
  model: DataplaneModel | null;
  /** Change is unavailable: the model was not read or an apply is running, a model change or a config one. */
  locked: boolean;
  foreignService: boolean;
  /** `null` means there were no model changes in this daemon lifetime. */
  transaction: ApplyTransaction | null;
  isConfirming: boolean;
  route: (source: RouteSource, routed: boolean) => void;
  confirm: () => void;
}

/**
 * The change id is taken from the daemon status, not from the `PUT` response,
 * so the confirmation window survives a page reload. Config apply blocks the
 * toggles too: the daemon holds both transactions in one cycle and would reject
 * the second with 409.
 */
export function useDeviceRoute(): DeviceRouteState {
  const status = useDaemonStatus();
  const dataplane = useDataplane();
  const change = useChangeDeviceRoute();
  const confirm = useConfirmDeviceRoute();

  const id = status.data?.dataplaneTransaction?.id ?? null;
  const state = useDataplaneTransaction(id);
  const transaction = state.data ?? status.data?.dataplaneTransaction ?? null;
  const model = dataplane.data?.model ?? null;
  const etag = dataplane.data?.etag ?? null;

  useModelRefresh(transaction);

  const mutate = change.mutate;
  const onRoute = useCallback(
    (source: RouteSource, routed: boolean) => {
      if (model === null) return;

      mutate({ model: withDeviceRoute(model, source, routed), base: etag });
    },
    [model, etag, mutate]
  );

  const confirmMutate = confirm.mutate;
  const onConfirm = useCallback(() => {
    if (transaction === null) return;

    confirmMutate(transaction.id);
  }, [transaction, confirmMutate]);

  return {
    model,
    locked:
      model === null ||
      change.isPending ||
      isApplyActive(transaction?.phase) ||
      isApplyActive(status.data?.transaction?.phase),
    foreignService: dataplane.data?.foreignService ?? false,
    transaction,
    isConfirming: confirm.isPending,
    route: onRoute,
    confirm: onConfirm,
  };
}
