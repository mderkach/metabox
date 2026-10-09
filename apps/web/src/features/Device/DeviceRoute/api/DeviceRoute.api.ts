import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  DATAPLANE_QUERY,
  changeDataplane,
  confirmDataplaneChange,
  useSaveDataplaneTransaction,
} from '@entities/Dataplane';
import { ApiError, type ApiFailureCode } from '@shared/api';

const MODIFIED: ApiFailureCode = 'dataplane_modified';

/**
 * Без ретраев: повтор запустил бы на устройстве второй цикл смены. Отказ
 * `dataplane_modified` значит, что секцию правили мимо панели: модель
 * перечитывается, и следующая смена строится уже от неё.
 */
export function useChangeDeviceRoute() {
  const queryClient = useQueryClient();
  const onTransaction = useSaveDataplaneTransaction();

  return useMutation({
    mutationFn: changeDataplane,
    meta: {
      showError: true,
      errorMessageKey: 'toast.device.route.failed',
      showSuccess: true,
      successMessageKey: 'toast.device.route.accepted',
    },
    onSuccess: onTransaction,
    onError: (error) => {
      if (error instanceof ApiError && error.code === MODIFIED) {
        void queryClient.invalidateQueries({ queryKey: DATAPLANE_QUERY.model() });
      }
    },
  });
}

export function useConfirmDeviceRoute() {
  const onTransaction = useSaveDataplaneTransaction();

  return useMutation({
    mutationFn: confirmDataplaneChange,
    meta: { showError: true, showSuccess: true, successMessageKey: 'toast.device.route.confirmed' },
    onSuccess: onTransaction,
  });
}
