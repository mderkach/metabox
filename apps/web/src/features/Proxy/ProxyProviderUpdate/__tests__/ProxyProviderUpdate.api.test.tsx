import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { server } from '@test/server';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getProxyProvidersOptions, PROXY_ENDPOINT } from '@entities/Proxy';
import { proxyHandlers } from '@entities/Proxy/__tests__/Proxy.handlers';
import { QueryClientInstance } from '@shared/api';

import { useUpdateProxyProvider } from '../api/ProxyProviderUpdate.api';

vi.mock('sonner', () => ({
  toast: { error: vi.fn<(text: string) => void>(), success: vi.fn<(text: string) => void>() },
}));

const { toast } = await import('sonner');

const SERVICE_UNAVAILABLE = 503;

/** App client: toasts are shown by its mutation cache, the test client has none. */
function AppQuery({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={QueryClientInstance}>{children}</QueryClientProvider>;
}

/** A mutation next to a list subscription: without an observer the invalidation will not refetch it. */
function useUpdateWithProviders() {
  return { providers: useQuery(getProxyProvidersOptions()), update: useUpdateProxyProvider() };
}

describe('useUpdateProxyProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    QueryClientInstance.clear();
    server.use(...proxyHandlers);
  });

  it('sends PUT for the subscription and rereads the subscription list', async () => {
    const updated = vi.fn<(path: string) => void>();
    const listed = vi.fn<() => void>();

    server.use(
      http.put(PROXY_ENDPOINT.provider('sub eu'), ({ request }) => {
        updated(new URL(request.url).pathname);

        return new HttpResponse(null, { status: 204 });
      }),
      http.get(PROXY_ENDPOINT.providers(), () => {
        listed();

        return HttpResponse.json({ providers: {} });
      })
    );

    const { result } = renderHook(useUpdateWithProviders, { wrapper: AppQuery });

    await waitFor(() => {
      expect(result.current.providers.isSuccess).toBe(true);
    });
    expect(listed).toHaveBeenCalledTimes(1);

    result.current.update.mutate('sub eu');

    await waitFor(() => {
      expect(listed).toHaveBeenCalledTimes(2);
    });
    expect(updated).toHaveBeenCalledWith('/api/clash/providers/proxies/sub%20eu');
    expect(toast.success).toHaveBeenCalledWith('Подписка обновлена');
  });

  it('shows the core failure by its message', async () => {
    server.use(
      http.put(PROXY_ENDPOINT.provider('sub-eu'), () =>
        HttpResponse.json({ message: 'fetch subscription: 403' }, { status: SERVICE_UNAVAILABLE })
      )
    );

    const { result } = renderHook(useUpdateProxyProvider, { wrapper: AppQuery });

    result.current.mutate('sub-eu');

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(toast.error).toHaveBeenCalledWith('Обновить подписку не удалось: fetch subscription: 403');
  });
});
