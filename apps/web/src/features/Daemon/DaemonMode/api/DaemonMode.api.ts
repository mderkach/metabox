import { useMutation, useQueryClient } from '@tanstack/react-query';

import { getClashConfigsOptions, setClashMode } from '@entities/Daemon';

/**
 * Routing mode change. The update is optimistic, as for node switching: the
 * config is not written, and waiting for the response would read as a hung
 * switch. Rereading after the response is required: sing-box silently skips a
 * mode it does not know.
 */
export function useSetClashMode() {
  const queryClient = useQueryClient();
  const { queryKey } = getClashConfigsOptions();

  return useMutation({
    mutationFn: setClashMode,
    meta: { showError: true, errorMessageKey: 'toast.clashMode.failed' },
    onMutate: async (mode: string) => {
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData(queryKey);

      if (previous !== undefined) {
        queryClient.setQueryData(queryKey, { ...previous, mode });
      }

      return { previous };
    },
    onError: (_error, _mode, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: async () => queryClient.invalidateQueries({ queryKey }),
  });
}
