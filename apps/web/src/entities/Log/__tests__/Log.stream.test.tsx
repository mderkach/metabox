import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LOG_QUERY } from '../api/Log.query';
import { LOG_RECONNECT, useLogStream } from '../api/Log.stream';
import { LOG_STREAM_STATUS } from '../model/Log.model';
import { LogStore } from '../model/Log.store';
import { FakeLogSource } from './Log.source';

function renderStream() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  const hook = renderHook(() => useLogStream('info'), { wrapper });

  return { hook, invalidate };
}

function refuse() {
  act(() => {
    FakeLogSource.last().refuse();
  });
}

function wait(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function status() {
  return LogStore.getState().status;
}

describe('useLogStream', () => {
  beforeEach(() => {
    FakeLogSource.opened = [];
    vi.stubGlobal('EventSource', FakeLogSource);
    vi.useFakeTimers();
    LogStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('на скрытой вкладке закрывает поток и открывает его, когда вкладка видна снова', () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);

    renderStream();
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(FakeLogSource.opened[0].closed).toBe(true);
    expect(FakeLogSource.opened).toHaveLength(1);

    hidden.mockReturnValue(false);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(FakeLogSource.opened).toHaveLength(2);
    expect(FakeLogSource.opened[1].closed).toBe(false);
  });

  it('скрытая вкладка снимает запланированный повтор', () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);

    renderStream();
    refuse();
    hidden.mockReturnValue(true);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    wait(LOG_RECONNECT.MaxDelay);
    expect(FakeLogSource.opened).toHaveLength(1);
  });

  it('отказанный поток открывает заново с задержкой, растущей вдвое', () => {
    renderStream();

    refuse();
    expect(status()).toBe(LOG_STREAM_STATUS.Reconnecting);
    expect(FakeLogSource.opened[0].closed).toBe(true);

    wait(LOG_RECONNECT.FirstDelay - 1);
    expect(FakeLogSource.opened).toHaveLength(1);

    wait(1);
    expect(FakeLogSource.opened).toHaveLength(2);

    refuse();
    wait(LOG_RECONNECT.FirstDelay);
    expect(FakeLogSource.opened).toHaveLength(2);

    wait(LOG_RECONNECT.FirstDelay);
    expect(FakeLogSource.opened).toHaveLength(3);
  });

  it('задержка не растёт выше потолка', () => {
    renderStream();

    for (let attempt = 0; attempt < LOG_RECONNECT.Attempts - 1; attempt += 1) {
      refuse();
      wait(LOG_RECONNECT.MaxDelay);
    }

    const opened = FakeLogSource.opened.length;

    refuse();
    wait(LOG_RECONNECT.MaxDelay);

    expect(FakeLogSource.opened).toHaveLength(opened + 1);
  });

  it('исчерпав попытки, закрывает поток и ждёт ручного переподключения', () => {
    const { hook } = renderStream();

    for (let attempt = 0; attempt < LOG_RECONNECT.Attempts; attempt += 1) {
      refuse();
      wait(LOG_RECONNECT.MaxDelay);
    }

    refuse();
    wait(LOG_RECONNECT.MaxDelay);

    expect(status()).toBe(LOG_STREAM_STATUS.Closed);
    expect(FakeLogSource.opened).toHaveLength(LOG_RECONNECT.Attempts + 1);

    act(() => {
      hook.result.current.reconnect();
    });

    expect(FakeLogSource.opened).toHaveLength(LOG_RECONNECT.Attempts + 2);
    expect(status()).toBe(LOG_STREAM_STATUS.Connecting);

    // Ручное переподключение начинает счёт попыток заново.
    refuse();
    expect(status()).toBe(LOG_STREAM_STATUS.Reconnecting);
  });

  it('открытие потока сбрасывает счёт неудач', () => {
    renderStream();

    for (let attempt = 0; attempt < LOG_RECONNECT.Attempts; attempt += 1) {
      refuse();
      wait(LOG_RECONNECT.MaxDelay);
    }

    act(() => {
      FakeLogSource.last().open();
    });
    refuse();

    expect(status()).toBe(LOG_STREAM_STATUS.Reconnecting);

    wait(LOG_RECONNECT.FirstDelay);
    expect(FakeLogSource.opened).toHaveLength(LOG_RECONNECT.Attempts + 2);
  });

  it('обрыв, который браузер переподключает сам, второго потока не заводит', () => {
    renderStream();

    act(() => {
      FakeLogSource.last().emit('error');
    });
    wait(LOG_RECONNECT.MaxDelay);

    expect(status()).toBe(LOG_STREAM_STATUS.Connecting);
    expect(FakeLogSource.opened).toHaveLength(1);
  });

  it('каждое открытие, включая первое, перечитывает хвост', () => {
    const { invalidate } = renderStream();

    act(() => {
      FakeLogSource.last().open();
    });

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenLastCalledWith({ queryKey: LOG_QUERY.tail('info') });

    refuse();
    wait(LOG_RECONNECT.FirstDelay);
    act(() => {
      FakeLogSource.last().open();
    });

    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  it('уход с экрана отменяет запланированную попытку', () => {
    const { hook } = renderStream();

    refuse();
    hook.unmount();
    wait(LOG_RECONNECT.MaxDelay);

    expect(FakeLogSource.opened).toHaveLength(1);
  });
});
