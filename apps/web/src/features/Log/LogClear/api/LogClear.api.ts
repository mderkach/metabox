import { useMutation, useQueryClient } from '@tanstack/react-query';

import { clearLogTail, LOG_QUERY, LogStore } from '@entities/Log';

/**
 * Очистка лога. Строки потока снимаются сразу, хвост перечитывается: демон
 * отдаёт его уже без строк до отметки очистки.
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
