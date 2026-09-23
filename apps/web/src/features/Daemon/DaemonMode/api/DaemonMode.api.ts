import { useMutation, useQueryClient } from '@tanstack/react-query';

import { getClashConfigsOptions, setClashMode } from '@entities/Daemon';

/**
 * Смена режима маршрутизации. Обновление оптимистичное, как у переключения
 * узла: конфиг не пишется, а ожидание ответа читалось бы как зависший
 * переключатель. Перечитывание после ответа обязательно — режим, которого
 * sing-box не знает, он пропускает молча.
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
