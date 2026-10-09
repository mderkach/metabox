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
 * Перечитывает модель, когда смена вышла из записи: в окне подтверждения в UCI
 * уже новая модель, после отката — снова прежняя, и тумблеры обязаны показывать
 * то, что стоит на устройстве.
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
  /** `null` — модель не прочитана, и писать её не из чего. */
  model: DataplaneModel | null;
  /** Смена недоступна: модель не прочитана или идёт применение — смена модели или конфига. */
  locked: boolean;
  /** `null` — смен модели в этой жизни демона не было. */
  transaction: ApplyTransaction | null;
  isConfirming: boolean;
  route: (source: RouteSource, routed: boolean) => void;
  confirm: () => void;
}

/**
 * Идентификатор смены берётся из статуса демона, а не из ответа на `PUT`: так
 * окно подтверждения переживает перезагрузку страницы. Применение конфига
 * блокирует тумблеры тоже — демон держит обе транзакции одним циклом и вторую
 * отклонил бы 409.
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

  useModelRefresh(transaction);

  const mutate = change.mutate;
  const onRoute = useCallback(
    (source: RouteSource, routed: boolean) => {
      if (model === null) return;

      mutate(withDeviceRoute(model, source, routed));
    },
    [model, mutate]
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
    transaction,
    isConfirming: confirm.isPending,
    route: onRoute,
    confirm: onConfirm,
  };
}
