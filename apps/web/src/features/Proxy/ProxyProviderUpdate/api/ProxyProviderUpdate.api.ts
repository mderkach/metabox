import { useMutation, useQueryClient } from '@tanstack/react-query';

import { PROXY_QUERY, updateProxyProvider } from '@entities/Proxy';

/**
 * Ручное обновление подписки. Перечитываются и подписки, и узлы: узлы
 * подписки рантайм отдаёт и в общем списке прокси.
 */
export function useUpdateProxyProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async function requestProviderUpdate(name: string) {
      return updateProxyProvider(name);
    },
    meta: {
      showError: true,
      errorMessageKey: 'toast.proxy.provider.failed',
      showSuccess: true,
      successMessageKey: 'toast.proxy.provider.updated',
    },
    onSettled: async () => queryClient.invalidateQueries({ queryKey: PROXY_QUERY.all }),
  });
}
