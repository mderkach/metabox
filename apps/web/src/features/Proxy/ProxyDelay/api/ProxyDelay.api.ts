import { useMutation, useQueryClient } from '@tanstack/react-query';

import { PROXY_QUERY, testProxyDelay } from '@entities/Proxy';

/** Node latency probe: the runtime appends it to the history, so the list is reread. */
export function useTestProxyDelay() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async function requestProxyDelay(name: string) {
      return testProxyDelay(name);
    },
    meta: { showError: true, errorMessageKey: 'toast.proxy.delay.failed' },
    onSettled: async () => queryClient.invalidateQueries({ queryKey: PROXY_QUERY.list() }),
  });
}
