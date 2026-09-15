import { useMutation, useQueryClient } from '@tanstack/react-query';

import { DAEMON_QUERY, getServiceStateOptions, runServiceAction } from '@entities/Daemon';

/** Ответ несёт новое состояние службы: перечитывать его отдельным запросом незачем. */
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
