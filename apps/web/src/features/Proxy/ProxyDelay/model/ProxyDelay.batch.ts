import { useCallback, useRef, useState } from 'react';

import { useTestProxyDelay } from '../api/ProxyDelay.api';

export function useTestProxyDelays() {
  const delay = useTestProxyDelay();
  const [isPending, setPending] = useState(false);
  const running = useRef(false);
  const { mutateAsync } = delay;
  const test = useCallback(
    async function testProxyDelays(names: readonly string[]): Promise<boolean> {
      if (running.current) return false;

      running.current = true;
      setPending(true);

      try {
        const results = await Promise.allSettled(names.map(async (name) => mutateAsync(name)));

        return results.every((result) => result.status === 'fulfilled');
      } finally {
        running.current = false;
        setPending(false);
      }
    },
    [mutateAsync]
  );

  return { test, isPending };
}
