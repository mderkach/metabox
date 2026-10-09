import { QueryClientProvider } from '@tanstack/react-query';
import { server } from '@test/server';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DATAPLANE_ENDPOINT, type DataplaneModel } from '@entities/Dataplane';
import { createDataplaneMock } from '@entities/Dataplane/__tests__/Dataplane.handlers';
import { QueryClientInstance } from '@shared/api';

import { useChangeDeviceRoute, useConfirmDeviceRoute } from '../api/DeviceRoute.api';

vi.mock('sonner', () => ({
  toast: { error: vi.fn<(text: string) => void>(), success: vi.fn<(text: string) => void>() },
}));

const { toast } = await import('sonner');

/** Клиент приложения: тосты показывает его кэш мутаций, у тестового клиента его нет. */
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

describe('useChangeDeviceRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    QueryClientInstance.clear();
    server.use(...createDataplaneMock().handlers);
  });

  it('смену, отклонённую из-за идущего применения, называет тостом с причиной', async () => {
    server.use(
      http.put(DATAPLANE_ENDPOINT.dataplane(), () =>
        HttpResponse.json({ code: 'apply_in_progress', message: 'применение уже идёт' }, { status: 409 })
      )
    );

    const { result } = renderHook(useChangeDeviceRoute, { wrapper: AppQuery });

    result.current.mutate(MODEL);

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(toast.error).toHaveBeenCalledWith('Сменить перехват устройства не удалось: применение уже идёт');
  });

  it('принятую смену объявляет тостом, подтверждение — своим', async () => {
    const change = renderHook(useChangeDeviceRoute, { wrapper: AppQuery });

    change.result.current.mutate(MODEL);

    await waitFor(() => {
      expect(change.result.current.isSuccess).toBe(true);
    });
    expect(toast.success).toHaveBeenCalledWith('Список перехвата принят, sing-box перезапускается');

    const confirm = renderHook(useConfirmDeviceRoute, { wrapper: AppQuery });

    confirm.result.current.mutate(change.result.current.data?.id ?? '');

    await waitFor(() => {
      expect(confirm.result.current.data?.phase).toBe('confirmed');
    });
    expect(toast.success).toHaveBeenLastCalledWith('Связь подтверждена, список перехвата оставлен');
  });
});
