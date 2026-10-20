import { QueryClientProvider } from '@tanstack/react-query';
import { server } from '@test/server';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DATAPLANE_ENDPOINT, useDataplane, type DataplaneModel } from '@entities/Dataplane';
import { DATAPLANE_FIXTURE } from '@entities/Dataplane/__tests__/Dataplane.fixture';
import { createDataplaneMock } from '@entities/Dataplane/__tests__/Dataplane.handlers';
import { QueryClientInstance } from '@shared/api';

import { useChangeDeviceRoute, useConfirmDeviceRoute } from '../api/DeviceRoute.api';

vi.mock('sonner', () => ({
  toast: { error: vi.fn<(text: string) => void>(), success: vi.fn<(text: string) => void>() },
}));

const { toast } = await import('sonner');

/** App client: toasts are shown by its mutation cache, the test client has none. */
function AppQuery({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={QueryClientInstance}>{children}</QueryClientProvider>;
}

const MODEL: DataplaneModel = {
  enabled: true,
  redirectPort: 5331,
  tproxyPort: 5332,
  dnsPort: 5333,
  dnsHijack: true,
  selfMark: 100,
  tproxyMark: 101,
  routeTable: 100,
  aclMode: 'listed',
  sourceIp: [],
  sourceMac: ['aa:bb:cc:00:00:40'],
  lanInterface: ['br-lan'],
  wanProxyCidr: [],
  wanDirectCidr: [],
  ipv6: false,
};

/** `ETag` of a fresh mock: nobody has changed the section yet. */
const BASE = '"dataplane-1"';

describe('useChangeDeviceRoute', () => {
  let mock = createDataplaneMock();

  beforeEach(() => {
    vi.clearAllMocks();
    QueryClientInstance.clear();
    mock = createDataplaneMock();
    server.use(...mock.handlers);
  });

  it('names a change rejected because an apply is in progress with a toast with the reason', async () => {
    server.use(
      http.put(DATAPLANE_ENDPOINT.dataplane(), () =>
        HttpResponse.json({ code: 'apply_in_progress', message: 'применение уже идёт' }, { status: 409 })
      )
    );

    const { result } = renderHook(useChangeDeviceRoute, { wrapper: AppQuery });

    result.current.mutate({ model: MODEL, base: BASE });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(toast.error).toHaveBeenCalledWith('Сменить перехват устройства не удалось: применение уже идёт');
  });

  it('announces an accepted change with a toast, the confirmation with its own', async () => {
    const change = renderHook(useChangeDeviceRoute, { wrapper: AppQuery });

    change.result.current.mutate({ model: MODEL, base: BASE });

    await waitFor(() => {
      expect(change.result.current.isSuccess).toBe(true);
    });
    expect(toast.success).toHaveBeenCalledWith('Настройка принята, sing-box перезапускается');

    const confirm = renderHook(useConfirmDeviceRoute, { wrapper: AppQuery });

    confirm.result.current.mutate(change.result.current.data?.id ?? '');

    await waitFor(() => {
      expect(confirm.result.current.data?.phase).toBe('confirmed');
    });
    expect(toast.success).toHaveBeenLastCalledWith('Связь подтверждена, настройка оставлена');
  });

  it('sends the model fingerprint in If-Match', async () => {
    const sent: (string | null)[] = [];

    server.events.on('request:start', ({ request }) => {
      if (request.method === 'PUT') sent.push(request.headers.get('If-Match'));
    });

    const { result } = renderHook(useChangeDeviceRoute, { wrapper: AppQuery });

    result.current.mutate({ model: MODEL, base: BASE });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    server.events.removeAllListeners('request:start');
    expect(sent).toEqual([BASE]);
  });

  it('the section was edited behind the panel: a toast with the reason and a reread model', async () => {
    const { result } = renderHook(() => ({ change: useChangeDeviceRoute(), dataplane: useDataplane() }), {
      wrapper: AppQuery,
    });

    await waitFor(() => {
      expect(result.current.dataplane.data?.etag).toBe(BASE);
    });

    mock.edit({ ...DATAPLANE_FIXTURE.model, source_mac: ['aa:bb:cc:00:00:99'] });
    result.current.change.mutate({ model: MODEL, base: BASE });

    await waitFor(() => {
      expect(result.current.change.isError).toBe(true);
    });
    expect(toast.error).toHaveBeenCalledWith(
      'Сменить перехват устройства не удалось: настройки перехвата трафика изменились на устройстве, список перечитан'
    );

    await waitFor(() => {
      expect(result.current.dataplane.data?.etag).toBe('"dataplane-2"');
    });
    expect(result.current.dataplane.data?.model.sourceMac).toEqual(['aa:bb:cc:00:00:99']);
  });
});
