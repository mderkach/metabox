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

/** App client: toasts are shown by its mutation cache, the test client has none. */
function AppQuery({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={QueryClientInstance}>{children}</QueryClientProvider>;
}

describe('useCloseAllConnections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    QueryClientInstance.clear();
    server.use(http.delete(CONNECTION_ENDPOINT.connections(), () => new HttpResponse(null, { status: 204 })));
  });

  // The drop is announced by the screen live region; a `sonner` toast would announce it a second time.
  it('after dropping all connections shows no success toast', async () => {
    const { result } = renderHook(useCloseAllConnections, { wrapper: AppQuery });

    result.current.mutate();

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(toast.success).not.toHaveBeenCalled();
  });
});
