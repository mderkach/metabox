import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RuntimeStore } from '@entities/Daemon';

import { useRuntimeStreams } from '../useRuntimeStreams';

/** В jsdom `EventSource` нет: проверяется, что делает оболочка при открытии и закрытии потока. */
class FakeEventSource {
  addEventListener(): void {}
  removeEventListener(): void {}
  close(): void {}
}

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe('useRuntimeStreams', () => {
  beforeEach(() => {
    vi.stubGlobal('EventSource', FakeEventSource);
    RuntimeStore.getState().reset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('закрывая поток, снимает отметку последнего кадра: на возврате экран ждёт новых данных', () => {
    renderHook(useRuntimeStreams, { wrapper });

    act(() => {
      RuntimeStore.getState().addReader();
    });
    RuntimeStore.getState().pushTraffic({ up: 1, down: 2 });

    act(() => {
      RuntimeStore.getState().removeReader();
    });

    expect(RuntimeStore.getState().sampledAt).toBeNull();
  });
});
