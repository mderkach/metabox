import { useMutation, useQueryClient } from '@tanstack/react-query';

import { getDevicesOptions, saveDeviceName } from '@entities/Device';

/**
 * Своё имя устройства. Ответ — список целиком, и кэш заменяется им, а не
 * инвалидацией: подпись зависит от всех источников сразу и уже посчитана
 * демоном, а перечитывание запустило бы `uci` на роутере ещё раз.
 */
export function useRenameDevice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveDeviceName,
    meta: { showError: true, errorMessageKey: 'toast.device.rename.failed' },
    onSuccess: (list) => {
      queryClient.setQueryData(getDevicesOptions().queryKey, list);
    },
  });
}
