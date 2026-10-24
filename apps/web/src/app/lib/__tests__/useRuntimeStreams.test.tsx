import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '@test/server';
import { act, render, renderHook, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { useEffect, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTH_ENDPOINT } from '@entities/Auth';
import { DAEMON_ENDPOINT, RuntimeStore } from '@entities/Daemon';

import { AuthGate } from '../../ui/AuthGate';
import { useRuntimeStreams } from '../useRuntimeStreams';

/** jsdom has no `EventSource`: checks what the shell does when a stream opens and closes. */
class FakeEventSource {
  static readonly CLOSED = 2;
  static last: FakeEventSource | null = null;

  readyState = 0;
  private readonly listeners = new Map<string, () => void>();

  constructor() {
    FakeEventSource.last = this;
  }

  addEventListener(type: string, handler: () => void): void {
    this.listeners.set(type, handler);
  }

  removeEventListener(): void {}
  close(): void {}

  /** The connection dropped: the browser reconnects by itself and reports an error event. */
  drop(): void {
    this.listeners.get('error')?.();
  }

  /** The daemon refused the stream: the browser closes it and reports only an error event. */
  refuse(): void {
    this.readyState = FakeEventSource.CLOSED;
    this.listeners.get('error')?.();
  }
}

/** The shell part that holds the stream open while a screen reads it. */
function Shell() {
  useRuntimeStreams();

  useEffect(function readRuntime() {
    RuntimeStore.getState().addReader();

    return function stopReadingRuntime() {
      RuntimeStore.getState().removeReader();
    };
  }, []);

  return <p>панель</p>;
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

  it('on close, clears the last-frame mark: on return the screen waits for new data', () => {
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

  it('shows the login screen when the stream closes and a probe gets 401', async () => {
    server.use(
      http.get(AUTH_ENDPOINT.state(), () => HttpResponse.json({ enabled: true, authenticated: true })),
      http.get(DAEMON_ENDPOINT.status(), () =>
        HttpResponse.json({ code: 'unauthorized', message: 'sign-in required' }, { status: 401 })
      )
    );

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AuthGate onLogin={vi.fn<() => void>()}>
          <Shell />
        </AuthGate>
      </QueryClientProvider>
    );

    expect(await screen.findByText('панель')).toBeInTheDocument();

    act(() => {
      FakeEventSource.last?.refuse();
    });

    expect(await screen.findByLabelText('Пароль')).toBeInTheDocument();
  });

  it('does not probe while the browser reconnects the stream', () => {
    const queryClient = new QueryClient();
    const fetchQuery = vi.spyOn(queryClient, 'fetchQuery');

    renderHook(useRuntimeStreams, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });

    act(() => {
      RuntimeStore.getState().addReader();
    });

    act(() => {
      FakeEventSource.last?.drop();
    });

    expect(fetchQuery).not.toHaveBeenCalled();
  });
});
