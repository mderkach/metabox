import { QueryClientProvider } from '@tanstack/react-query';
import { server } from '@test/server';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { proxyHandlers } from '@entities/Proxy/__tests__/Proxy.handlers';
import { QueryClientInstance } from '@shared/api';

import { useSelectProxy } from '../api/ProxySelect.api';

vi.mock('sonner', () => ({
  toast: { error: vi.fn<(text: string) => void>(), success: vi.fn<(text: string) => void>() },
}));

const { toast } = await import('sonner');

/** Клиент приложения: тосты показывает его кэш мутаций, у тестового клиента его нет. */
function AppQuery({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={QueryClientInstance}>{children}</QueryClientProvider>;
}

describe('useSelectProxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    QueryClientInstance.clear();
    server.use(...proxyHandlers);
  });

  // Выбор объявляет живая область экрана; тост `sonner` объявил бы его второй раз.
  it('после выбора узла тоста об успехе не показывает', async () => {
    const { result } = renderHook(useSelectProxy, { wrapper: AppQuery });

    result.current.mutate({ group: 'us-fallback', node: 'proxy' });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(toast.success).not.toHaveBeenCalled();
  });
});
