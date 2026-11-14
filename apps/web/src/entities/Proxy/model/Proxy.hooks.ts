import { useCallback, useEffect, useState } from 'react';

import type { ProxyProvider } from './Proxy.model';
import { observeProviders, toProviderNodeChange, type ProviderNodeChange } from './Proxy.nodeDrop';
import { readSeenProviders, writeSeenProviders } from './Proxy.storage';

/**
 * Node count change of each subscription at its last update this browser saw,
 * a manual one or one the core made in the background.
 */
export function useProviderNodeChanges(
  providers: readonly ProxyProvider[] | undefined
): (provider: ProxyProvider) => ProviderNodeChange {
  const [seen, setSeen] = useState(readSeenProviders);
  const next = providers === undefined ? seen : observeProviders(seen, providers);

  // Adjusting state during render: the new snapshot is compared with the record
  // before it, and the change shows in the same commit as the new counts.
  if (next !== seen) {
    setSeen(next);
  }

  useEffect(
    function rememberSeenProviders() {
      writeSeenProviders(seen);
    },
    [seen]
  );

  return useCallback((provider: ProxyProvider) => toProviderNodeChange(next[provider.name], provider.nodes), [next]);
}
