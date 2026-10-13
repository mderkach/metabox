import { useMutation, useQueryClient } from '@tanstack/react-query';

import { DAEMON_QUERY, getServiceStateOptions, runServiceAction } from '@entities/Daemon';

/** The response carries the new service state: there is no need to reread it with a separate query. */
export function useServiceAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: runServiceAction,
    meta: { showError: true, errorMessageKey: 'toast.service.action.failed' },
    onSuccess: (state) => {
      queryClient.setQueryData(getServiceStateOptions().queryKey, state);
    },
    onSettled: async () => queryClient.invalidateQueries({ queryKey: DAEMON_QUERY.all }),
  });
}
