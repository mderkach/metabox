import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it } from 'vitest';

import { ConfigDocumentStore } from '@entities/Config';
import { getDaemonStatusOptions } from '@entities/Daemon';
import { DAEMON_STATUS_FIXTURE } from '@entities/Daemon/__tests__/Daemon.fixture';

import { useConfigDnsEditDraft } from '../model/ConfigDnsEdit.draft';

it('refuses to stage a resolver when the cached core changes before the form rerenders', () => {
  const text = '{"dns":{"servers":[{"type":"tcp","tag":"primary","server":"192.0.2.1"}]}}';
  const document = ConfigDocumentStore.getState();
  document.load(text);
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  const options = getDaemonStatusOptions();
  const status = {
    ...DAEMON_STATUS_FIXTURE,
    core: { type: 'sing-box', variant: 'extended', version: '1.14.3-extended-2.7.3' },
  };
  client.setQueryData(options.queryKey, status);

  const { result, unmount } = renderHook(() => useConfigDnsEditDraft(text), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });

  try {
    expect(result.current.model.addReason).toBeNull();
    const { addServer } = result.current;
    const updates: unknown[] = [];
    const unsubscribe = ConfigDocumentStore.subscribe((state) => updates.push(state.draft));
    try {
      act(() => {
        client.setQueryData(options.queryKey, { ...status, core: { ...status.core, version: '1.14.0' } });
        expect(addServer({ tag: 'backup', address: '192.0.2.53', detour: '' }, () => {})).toBe('stale');
      });
      expect(updates).toHaveLength(0);
    } finally {
      unsubscribe();
    }
  } finally {
    unmount();
    client.clear();
    document.reset();
  }
});
