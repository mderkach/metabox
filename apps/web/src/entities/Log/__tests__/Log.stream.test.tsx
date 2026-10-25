import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { STREAM_RECONNECT } from '@shared/api';

import { LOG_QUERY } from '../api/Log.query';
import { useLogStream } from '../api/Log.stream';
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

  it('on a hidden tab closes the stream and opens it when the tab is visible again', () => {
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

  it('a hidden tab cancels the scheduled retry', () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);

    renderStream();
    refuse();
    hidden.mockReturnValue(true);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    wait(STREAM_RECONNECT.MaxDelay);
    expect(FakeLogSource.opened).toHaveLength(1);
  });

  it('reopens a failed stream with a delay that doubles', () => {
    renderStream();

    refuse();
    expect(status()).toBe(LOG_STREAM_STATUS.Reconnecting);
    expect(FakeLogSource.opened[0].closed).toBe(true);

    wait(STREAM_RECONNECT.FirstDelay - 1);
    expect(FakeLogSource.opened).toHaveLength(1);

    wait(1);
    expect(FakeLogSource.opened).toHaveLength(2);

    refuse();
    wait(STREAM_RECONNECT.FirstDelay);
    expect(FakeLogSource.opened).toHaveLength(2);

    wait(STREAM_RECONNECT.FirstDelay);
    expect(FakeLogSource.opened).toHaveLength(3);
  });

  it('the delay does not grow above the ceiling', () => {
    renderStream();

    for (let attempt = 0; attempt < STREAM_RECONNECT.Attempts - 1; attempt += 1) {
      refuse();
      wait(STREAM_RECONNECT.MaxDelay);
    }

    const opened = FakeLogSource.opened.length;

    refuse();
    wait(STREAM_RECONNECT.MaxDelay);

    expect(FakeLogSource.opened).toHaveLength(opened + 1);
  });

  it('after exhausting attempts closes the stream and waits for a manual reconnect', () => {
    const { hook } = renderStream();

    for (let attempt = 0; attempt < STREAM_RECONNECT.Attempts; attempt += 1) {
      refuse();
      wait(STREAM_RECONNECT.MaxDelay);
    }

    refuse();
    wait(STREAM_RECONNECT.MaxDelay);

    expect(status()).toBe(LOG_STREAM_STATUS.Closed);
    expect(FakeLogSource.opened).toHaveLength(STREAM_RECONNECT.Attempts + 1);

    act(() => {
      hook.result.current.reconnect();
    });

    expect(FakeLogSource.opened).toHaveLength(STREAM_RECONNECT.Attempts + 2);
    expect(status()).toBe(LOG_STREAM_STATUS.Connecting);

    // A manual reconnect restarts the attempt count.
    refuse();
    expect(status()).toBe(LOG_STREAM_STATUS.Reconnecting);
  });

  it('opening the stream resets the failure count', () => {
    renderStream();

    for (let attempt = 0; attempt < STREAM_RECONNECT.Attempts; attempt += 1) {
      refuse();
      wait(STREAM_RECONNECT.MaxDelay);
    }

    act(() => {
      FakeLogSource.last().open();
    });
    refuse();

    expect(status()).toBe(LOG_STREAM_STATUS.Reconnecting);

    wait(STREAM_RECONNECT.FirstDelay);
    expect(FakeLogSource.opened).toHaveLength(STREAM_RECONNECT.Attempts + 2);
  });

  it('a drop that the browser reconnects by itself does not create a second stream', () => {
    renderStream();

    act(() => {
      FakeLogSource.last().emit('error');
    });
    wait(STREAM_RECONNECT.MaxDelay);

    expect(status()).toBe(LOG_STREAM_STATUS.Connecting);
    expect(FakeLogSource.opened).toHaveLength(1);
  });

  it('every open, including the first, rereads the tail', () => {
    const { invalidate } = renderStream();

    act(() => {
      FakeLogSource.last().open();
    });

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenLastCalledWith({ queryKey: LOG_QUERY.tail('info') });

    refuse();
    wait(STREAM_RECONNECT.FirstDelay);
    act(() => {
      FakeLogSource.last().open();
    });

    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  it('leaving the screen cancels the scheduled attempt', () => {
    const { hook } = renderStream();

    refuse();
    hook.unmount();
    wait(STREAM_RECONNECT.MaxDelay);

    expect(FakeLogSource.opened).toHaveLength(1);
  });
});
