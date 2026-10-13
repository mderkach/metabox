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
 * No retries: a repeat would start a second change cycle on the device. The
 * `dataplane_modified` failure means the section was edited behind the panel's
 * back: the model is reread, and the next change is built from it.
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
