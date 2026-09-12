import { useMutation, useQueryClient } from '@tanstack/react-query';

import { DAEMON_QUERY, getServiceStateOptions, runServiceAction } from '@entities/Daemon';

/**
 * Запуск, остановка и перезапуск службы. Ответ — новое состояние, и оно
 * кладётся в кэш: перечитывать его отдельным запросом незачем.
 */
export function useServiceAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: runServiceAction,
    meta: { showError: true, errorMessageKey: 'service.action.failed' },
    onSuccess: (state) => {
      queryClient.setQueryData(getServiceStateOptions().queryKey, state);
    },
    onSettled: async () => queryClient.invalidateQueries({ queryKey: DAEMON_QUERY.all }),
  });
}
