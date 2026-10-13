import { useMutation, useQueryClient } from '@tanstack/react-query';

import { PROXY_QUERY, updateProxyProvider } from '@entities/Proxy';

/**
 * Manual subscription update. Both subscriptions and nodes are reread: the
 * runtime serves subscription nodes in the general proxy list too.
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
