import { QueryClientProvider } from '@tanstack/react-query';
import { server } from '@test/server';
import { act, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DAEMON_ENDPOINT, getDaemonStatusOptions } from '@entities/Daemon';
import { DAEMON_STATUS_FIXTURE } from '@entities/Daemon/__tests__/Daemon.fixture';
import { QueryClientInstance } from '@shared/api';

import { DAEMON_RESTART, useDaemonRestart } from '../api/DaemonControl.api';
import { DaemonRestart } from '../ui/DaemonRestart';

vi.mock('sonner', () => ({
  toast: { error: vi.fn<(text: string) => void>(), success: vi.fn<(text: string) => void>() },
}));

const { toast } = await import('sonner');

// Captured before the fake clock replaces it: msw responses arrive on the real one.
const realSetTimeout = globalThis.setTimeout;

const OLD = 'OLD-INSTANCE';
const NEW = 'NEW-INSTANCE';

/** App client: toasts are shown by its caches, the test client has none. */
function AppQuery({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={QueryClientInstance}>{children}</QueryClientProvider>;
}

/**
 * The daemon answers with `before` until the restart is asked, then with each
 * of `after` in turn, repeating the last one.
 */
function serveRestart(after: (string | null)[]) {
  const restarts = vi.fn<() => void>();
  let answers: (string | null)[] = [OLD];

  server.use(
    http.get(DAEMON_ENDPOINT.status(), () => {
      const instance = answers.length > 1 ? answers.shift() : answers[0];

      return instance === null || instance === undefined
        ? new HttpResponse(null, { status: 503 })
        : HttpResponse.json({ ...DAEMON_STATUS_FIXTURE, instance });
    }),
    http.post(DAEMON_ENDPOINT.restart(), () => {
      restarts();
      answers = [...after];

      return new HttpResponse(null, { status: 202 });
    })
  );

  return restarts;
}

/** Moves the fake clock one poll ahead and lets the msw answer in. */
async function nextPoll() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(DAEMON_RESTART.Poll);
    await new Promise((resolve) => {
      realSetTimeout(resolve, 0);
    });
  });
}

async function seedStatus() {
  await QueryClientInstance.query(getDaemonStatusOptions());
}

describe('daemon restart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    QueryClientInstance.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks first and says the charts start over', async () => {
    const restarts = serveRestart([NEW]);
    const user = userEvent.setup();

    render(<DaemonRestart />, { wrapper: AppQuery });
    await user.click(screen.getByRole('button', { name: 'Перезапустить панель' }));

    expect(screen.getByText(/Графики и счётчики срабатываний правил начнутся заново/)).toBeInTheDocument();
    expect(restarts).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(restarts).not.toHaveBeenCalled();
  });

  it('waits for a new daemon process and reports the return', async () => {
    // The old process may still answer right after the launch, then the daemon is silent.
    const restarts = serveRestart([OLD, null, NEW]);
    const user = userEvent.setup();

    await seedStatus();
    render(<DaemonRestart />, { wrapper: AppQuery });
    await user.click(screen.getByRole('button', { name: 'Перезапустить панель' }));

    // The dialog opens on the real clock; the wait for the daemon runs on the fake one,
    // which also follows the real one so that the click itself is not stuck.
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'], shouldAdvanceTime: true });
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Перезапустить панель' }));
    await nextPoll();

    expect(restarts).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Перезапустить панель' })).toHaveTextContent('Перезапуск…');
    expect(screen.getByRole('button', { name: 'Перезапустить панель' })).toBeDisabled();

    await nextPoll();

    expect(toast.success).not.toHaveBeenCalled();

    await nextPoll();
    await nextPoll();

    expect(toast.success).toHaveBeenCalledWith('Панель перезапущена');
    expect(screen.getByRole('button', { name: 'Перезапустить панель' })).toBeEnabled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('reports a restart after which the old process still answers', async () => {
    serveRestart([OLD]);
    await seedStatus();
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });

    const { result } = renderHook(useDaemonRestart, { wrapper: AppQuery });

    act(() => {
      result.current.mutate();
    });

    for (let waited = 0; waited <= DAEMON_RESTART.Timeout; waited += DAEMON_RESTART.Poll) {
      await nextPoll();
    }

    expect(result.current.isError).toBe(true);
    expect(toast.error).toHaveBeenCalledWith('Не удалось перезапустить панель: отвечает прежний процесс демона');
  });

  // A daemon that did not come back is reported by the shell banner, not by a toast.
  it('leaves a daemon that did not come back to the banner', async () => {
    serveRestart([null]);
    await seedStatus();
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });

    const { result } = renderHook(useDaemonRestart, { wrapper: AppQuery });

    act(() => {
      result.current.mutate();
    });

    for (let waited = 0; waited <= DAEMON_RESTART.Timeout; waited += DAEMON_RESTART.Poll) {
      await nextPoll();
    }

    expect(result.current.isError).toBe(true);
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
