import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '@test/server';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { PROXY_ENDPOINT, toProxyRuntime } from '@entities/Proxy';
import { CLASH_PROXIES_FIXTURE } from '@entities/Proxy/__tests__/Proxy.fixture';
import { proxyHandlers } from '@entities/Proxy/__tests__/Proxy.handlers';
import { ProxyLatency } from '@widgets/ProxyLatency';

import { ProxyTestAll } from '../ui/ProxyTestAll';

const GROUPS = toProxyRuntime(CLASH_PROXIES_FIXTURE).groups;

describe('latency batches', () => {
  it.each([
    { kind: 'groups', failed: false },
    { kind: 'groups', failed: true },
    { kind: 'selected nodes', failed: false },
    { kind: 'selected nodes', failed: true },
  ])('keeps $kind busy until the whole batch settles (failed: $failed)', async ({ kind, failed }) => {
    let releaseFirst = () => {};
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const requested = vi.fn<(name: string) => void>();
    const onTested = vi.fn<() => void>();

    server.use(...proxyHandlers);
    server.use(
      http.get(PROXY_ENDPOINT.proxyDelay('*'), async ({ request }) => {
        const name = decodeURIComponent(new URL(request.url).pathname.split('/').at(-2) ?? '');

        requested(name);
        if (requested.mock.calls.length === 1) {
          await first;
          if (failed) return new HttpResponse(null, { status: 500 });
        }

        return HttpResponse.json({ delay: 100 });
      })
    );
    const user = userEvent.setup();

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

    const label = kind === 'groups' ? 'Проверить все' : 'Проверить';

    render(
      <QueryClientProvider client={queryClient}>
        {kind === 'groups' ? (
          <ProxyTestAll groups={GROUPS} nodes={[]} onTested={onTested} />
        ) : (
          <ProxyLatency onTested={onTested} />
        )}
      </QueryClientProvider>
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: label })).toBeEnabled();
    });
    await user.click(screen.getByRole('button', { name: label }));
    await waitFor(() => {
      expect(requested.mock.calls.length).toBeGreaterThan(1);
    });
    await waitFor(() => {
      expect(queryClient.getMutationCache().getAll().at(-1)?.state.status).toBe('success');
    });
    expect(screen.getByRole('button', { name: 'Проверяю' })).toBeDisabled();
    expect(onTested).not.toHaveBeenCalled();

    releaseFirst();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: label })).toBeEnabled();
      expect(onTested).toHaveBeenCalledTimes(failed ? 0 : 1);
    });
  });
});
