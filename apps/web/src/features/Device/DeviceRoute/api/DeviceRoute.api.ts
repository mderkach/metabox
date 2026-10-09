import { useMutation } from '@tanstack/react-query';

import { changeDataplane, confirmDataplaneChange, useSaveDataplaneTransaction } from '@entities/Dataplane';

/** Без ретраев: повтор запустил бы на устройстве второй цикл смены. */
export function useChangeDeviceRoute() {
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
