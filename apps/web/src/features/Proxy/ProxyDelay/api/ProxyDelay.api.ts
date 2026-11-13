import { useMutation, useQueryClient } from '@tanstack/react-query';

import { isProbeFailure, PROXY_MUTATION, PROXY_QUERY, testProxyDelay, type ProbeOutcome } from '@entities/Proxy';
import { CACHE_TIME } from '@shared/api';

/**
 * How long a failed probe is remembered. The fork also drops history on a restart, and a
 * node fixed since would keep reading "did not answer" for as long as the outcome lives.
 */
const FAILED_PROBE_MEMORY_MINUTES = 5;
const FAILED_PROBE_MEMORY = FAILED_PROBE_MEMORY_MINUTES * CACHE_TIME.Minute;

/**
 * Node latency probe: the runtime appends it to the history, so the list is reread.
 *
 * A node that did not answer is a result, not a panel failure: the mutation resolves
 * with `failed`, and the outcome stays in the mutation cache for `useProxies`, since
 * the fork keeps no trace of it. Other errors reject and show a toast.
 */
export function useTestProxyDelay() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: PROXY_MUTATION.delay(),
    mutationFn: async function requestProxyDelay(name: string): Promise<ProbeOutcome> {
      try {
        await testProxyDelay(name);

        return { name, failed: false };
      } catch (error) {
        if (isProbeFailure(error)) {
          return { name, failed: true };
        }

        throw error;
      }
    },
    gcTime: FAILED_PROBE_MEMORY,
    meta: { showError: true, errorMessageKey: 'toast.proxy.delay.failed' },
    onSettled: async () => queryClient.invalidateQueries({ queryKey: PROXY_QUERY.list() }),
  });
}
