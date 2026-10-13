import { useMutation, useQueryClient } from '@tanstack/react-query';

import { clearLogTail, LOG_QUERY, LogStore } from '@entities/Log';

/**
 * Log clear. Stream lines are removed at once, the tail is reread: the daemon
 * serves it already without the lines before the clear mark.
 */
export function useClearLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: clearLogTail,
    meta: { showError: true, errorMessageKey: 'toast.log.clear.failed' },
    onSuccess: () => {
      LogStore.getState().reset();
      void queryClient.invalidateQueries({ queryKey: LOG_QUERY.all });
    },
  });
}
