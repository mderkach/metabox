import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '@test/server';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { AUTH_ENDPOINT, AUTH_QUERY } from '@entities/Auth';
import { ConfigDocumentState, CONFIG_QUERY } from '@entities/Config';

import { useLogout } from '../api/AuthLogout.api';

const TEXT = '{\n  "log": { "level": "info" }\n}';

describe('useLogout', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    ConfigDocumentState.getState().reset();
    server.use(http.post(AUTH_ENDPOINT.logout(), () => new HttpResponse(null, { status: 204 })));
  });

  it('forgets the config, the draft and its browser record, and keeps only the login state', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });

    queryClient.setQueryData(CONFIG_QUERY.current(), { text: TEXT });
    ConfigDocumentState.getState().load(TEXT, '"etag"');
    ConfigDocumentState.getState().loadLists({ 'my.json': '{}' }, 'lists');
    ConfigDocumentState.getState().edit(['log', 'level'], 'debug');
    ConfigDocumentState.getState().editList('new.json', '{}');

    expect(globalThis.localStorage.length).toBe(1);

    const { result } = renderHook(useLogout, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });

    result.current.mutate();

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const document = ConfigDocumentState.getState();

    expect(document.applied).toBeNull();
    expect(document.appliedEtag).toBeNull();
    expect(document.draft).toBeNull();
    expect(document.draftBase).toBeNull();
    expect(document.appliedLists).toBeNull();
    expect(document.listsDraft).toEqual({});
    expect(globalThis.localStorage.length).toBe(0);
    expect(
      queryClient
        .getQueryCache()
        .getAll()
        .map((query) => query.queryKey[0])
    ).toEqual([AUTH_QUERY.all[0]]);
  });
});
