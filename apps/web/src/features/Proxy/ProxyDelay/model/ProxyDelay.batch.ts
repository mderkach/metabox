import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

import { PROXY_QUERY } from '@entities/Proxy';

import { useTestProxyDelay } from '../api/ProxyDelay.api';

/**
 * Probes in flight at once. The browser holds six connections per host, and a request
 * waiting for a slot spends its own timeout: a whole subscription probed at once would
 * end in timeouts that read as a silent daemon.
 */
const PROBE_CONCURRENCY = 4;

/** Probes a set of nodes and rereads the proxy list once, after the last probe. */
export function useTestProxyDelays() {
  const queryClient = useQueryClient();
  const delay = useTestProxyDelay();
  const [isPending, setPending] = useState(false);
  const running = useRef(false);
  const { mutateAsync } = delay;
  const test = useCallback(
    async function testProxyDelays(names: readonly string[]): Promise<boolean> {
      if (running.current) return false;

      running.current = true;
      setPending(true);

      const queue = [...new Set(names)];
      let success = true;

      async function drainQueue(): Promise<void> {
        for (let name = queue.shift(); name !== undefined; name = queue.shift()) {
          try {
            await mutateAsync(name);
          } catch {
            success = false;
          }
        }
      }

      try {
        await Promise.all(Array.from({ length: Math.min(PROBE_CONCURRENCY, queue.length) }, drainQueue));

        return success;
      } finally {
        await queryClient.invalidateQueries({ queryKey: PROXY_QUERY.list() });
        running.current = false;
        setPending(false);
      }
    },
    [mutateAsync, queryClient]
  );

  return { test, isPending };
}
