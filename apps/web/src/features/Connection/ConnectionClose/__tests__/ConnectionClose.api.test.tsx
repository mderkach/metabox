import { QueryClientProvider } from '@tanstack/react-query';
import { server } from '@test/server';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CONNECTION_ENDPOINT } from '@entities/Connection';
import { QueryClientInstance } from '@shared/api';

import { useCloseAllConnections } from '../api/ConnectionClose.api';

vi.mock('sonner', () => ({
  toast: { error: vi.fn<(text: string) => void>(), success: vi.fn<(text: string) => void>() },
}));

const { toast } = await import('sonner');

/** Клиент приложения: тосты показывает его кэш мутаций, у тестового клиента его нет. */
function AppQuery({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={QueryClientInstance}>{children}</QueryClientProvider>;
}

describe('useCloseAllConnections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    QueryClientInstance.clear();
    server.use(http.delete(CONNECTION_ENDPOINT.connections(), () => new HttpResponse(null, { status: 204 })));
  });

  // Обрыв объявляет живая область экрана; тост `sonner` объявил бы его второй раз.
  it('после обрыва всех соединений тоста об успехе не показывает', async () => {
    const { result } = renderHook(useCloseAllConnections, { wrapper: AppQuery });

    result.current.mutate();

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(toast.success).not.toHaveBeenCalled();
  });
});
