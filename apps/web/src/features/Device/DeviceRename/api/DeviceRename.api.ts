import { useMutation, useQueryClient } from '@tanstack/react-query';

import { getDevicesOptions, saveDeviceName } from '@entities/Device';

/**
 * Device's own name. The response is the whole list, and the cache is replaced
 * by it rather than invalidated: the label depends on all sources at once and
 * is already computed by the daemon, while a reread would run `uci` on the
 * router once more.
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
