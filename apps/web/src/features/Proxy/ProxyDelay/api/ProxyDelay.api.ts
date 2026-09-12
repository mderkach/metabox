import { useMutation, useQueryClient } from '@tanstack/react-query';

import { PROXY_QUERY, testProxyDelay } from '@entities/Proxy';

/** Замер задержки узла: рантайм дописывает его в историю, поэтому список перечитывается. */
export function useTestProxyDelay() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async function requestProxyDelay(name: string) {
      return testProxyDelay(name);
    },
    meta: { showError: true, errorMessageKey: 'proxy.delay.failed' },
    onSettled: async () => queryClient.invalidateQueries({ queryKey: PROXY_QUERY.list() }),
  });
}
