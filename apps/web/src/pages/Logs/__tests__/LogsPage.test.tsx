import { renderWithRouter } from '@test/renderWithRouter';
import { selectOption } from '@test/selectOption';
import { server } from '@test/server';
import { mockVirtualSizes } from '@test/virtualSizes';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { LOG_ENDPOINT, LogStore } from '@entities/Log';
import { LOG_ENTRIES_FIXTURE } from '@entities/Log/__tests__/Log.fixture';
import { createLogHandlers } from '@entities/Log/__tests__/Log.handlers';
import { FakeLogSource } from '@entities/Log/__tests__/Log.source';

import { LogsPage } from '../ui/LogsPage';

/** Failure loop ceiling: the screen has fewer attempts, the test must not spin forever. */
const MAX_REFUSALS = 20;

function renderScreen() {
  return renderWithRouter(LogsPage, { path: '/logs' });
}

describe('logs screen', () => {
  beforeEach(() => {
    FakeLogSource.opened = [];
    vi.stubGlobal('EventSource', FakeLogSource);
    mockVirtualSizes({ row: 24 });
    // Following scrolls the list to the last line, and jsdom has no scrolling.
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    LogStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows the log tail with level and source', async () => {
    server.use(...createLogHandlers());

    renderScreen();

    expect(await screen.findByText('outbound/vless[proxy]: dial tcp: i/o timeout')).toBeInTheDocument();
    // The default level is info: the daemon does not serve debug lines at all.
    expect(screen.queryByText('dns: exchanged example.com A 93.184.215.14')).not.toBeInTheDocument();
    expect(screen.getByText('источник: logread')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Лог sing-box' })).toHaveAttribute('aria-rowcount', '5');
  });

  it('the level goes into both the tail request and the stream', async () => {
    const user = userEvent.setup();
    const levels: (string | null)[] = [];

    server.use(
      http.get(LOG_ENDPOINT.logs(), ({ request }) => {
        levels.push(new URL(request.url).searchParams.get('level'));

        return HttpResponse.json({ source: 'logread', entries: [] });
      })
    );

    renderScreen();

    await screen.findByText('Строк нет');
    expect(FakeLogSource.last().url).toBe('/api/logs/stream?level=info');

    await selectOption(user, screen.getByRole('combobox', { name: 'Минимальный уровень лога' }), 'warn и выше');

    await waitFor(() => {
      expect(levels.at(-1)).toBe('warn');
    });
    expect(levels[0]).toBe('info');
    expect(FakeLogSource.last().url).toBe('/api/logs/stream?level=warn');
    expect(FakeLogSource.opened[0].closed).toBe(true);
  });

  it('stream lines are appended under the tail', async () => {
    server.use(...createLogHandlers());

    renderScreen();

    await screen.findByText('outbound/vless[proxy]: dial tcp: i/o timeout');

    act(() => {
      FakeLogSource.last().open();
      FakeLogSource.last().line(1, 'router: новая строка из потока');
    });

    expect(await screen.findByText('router: новая строка из потока')).toBeInTheDocument();
    expect(screen.getByText('поток идёт')).toBeInTheDocument();
    expect(screen.queryByText(/Пропущен/)).not.toBeInTheDocument();
  });

  it('a seq gap shows how many lines were lost', async () => {
    server.use(...createLogHandlers());

    renderScreen();

    await screen.findByText('outbound/vless[proxy]: dial tcp: i/o timeout');

    act(() => {
      FakeLogSource.last().line(1, 'первая');
      FakeLogSource.last().line(5, 'после разрыва');
    });

    expect(await screen.findByText('Пропущено 3 строки')).toBeInTheDocument();
    expect(screen.getByText('после разрыва')).toBeInTheDocument();
  });

  it('opening the stream rereads the tail and does not duplicate lines at the join', async () => {
    let requests = 0;
    const last = LOG_ENTRIES_FIXTURE[LOG_ENTRIES_FIXTURE.length - 1];
    // Testing Library compares text without leading spaces.
    const shown = last.message.trim();

    function countTail({ request }: { request: Request }) {
      if (new URL(request.url).pathname === LOG_ENDPOINT.logs()) {
        requests += 1;
      }
    }

    server.use(...createLogHandlers());
    server.events.on('request:start', countTail);
    onTestFinished(() => {
      server.events.removeListener('request:start', countTail);
    });

    renderScreen();

    await screen.findByText(shown);

    const before = requests;

    act(() => {
      const source = FakeLogSource.last();

      source.open();
      // The line managed to arrive by stream and got into the tail reread after the open.
      source.send(1, last);
      source.line(2, 'router: строка после хвоста');
    });

    expect(await screen.findByText('router: строка после хвоста')).toBeInTheDocument();
    await waitFor(() => {
      expect(requests).toBe(before + 1);
    });
    expect(screen.getAllByText(shown)).toHaveLength(1);
  });

  it('a stream the daemon refused reconnects by itself', async () => {
    server.use(...createLogHandlers());

    renderScreen();

    await screen.findByText('outbound/vless[proxy]: dial tcp: i/o timeout');
    vi.useFakeTimers();

    act(() => {
      FakeLogSource.last().refuse();
    });

    expect(screen.getByText('переподключаюсь к потоку')).toBeInTheDocument();
    expect(screen.queryByText('Поток лога закрыт')).not.toBeInTheDocument();

    act(() => {
      vi.runOnlyPendingTimers();
    });
    act(() => {
      FakeLogSource.last().open();
    });

    expect(FakeLogSource.opened).toHaveLength(2);
    expect(FakeLogSource.opened[0].closed).toBe(true);
    expect(screen.getByText('поток идёт')).toBeInTheDocument();
  });

  it('after exhausting attempts offers a manual reconnect', async () => {
    const user = userEvent.setup();

    server.use(...createLogHandlers());

    renderScreen();

    await screen.findByText('outbound/vless[proxy]: dial tcp: i/o timeout');
    vi.useFakeTimers();

    // The attempts are finite: failure after failure the screen reaches a manual reconnect.
    for (let refused = 0; refused < MAX_REFUSALS && screen.queryByText('Поток лога закрыт') === null; refused += 1) {
      act(() => {
        FakeLogSource.last().refuse();
        vi.runOnlyPendingTimers();
      });
    }

    const opened = FakeLogSource.opened.length;

    vi.useRealTimers();

    const alert = await screen.findByRole('alert');

    expect(within(alert).getByText('Поток лога закрыт')).toBeInTheDocument();

    await user.click(within(alert).getByRole('button', { name: 'Переподключить' }));

    expect(FakeLogSource.opened).toHaveLength(opened + 1);
    await waitFor(() => {
      expect(screen.queryByText('Поток лога закрыт')).not.toBeInTheDocument();
    });
  });

  it('with logread the action hides lines and explains that the system log keeps them', async () => {
    const user = userEvent.setup();
    const cleared = vi.fn<() => void>();

    server.use(
      http.post(LOG_ENDPOINT.clear(), () => {
        cleared();

        return HttpResponse.json({ since: '2026-10-09T10:05:00+03:00' });
      }),
      ...createLogHandlers()
    );

    renderScreen();

    await screen.findByText('outbound/vless[proxy]: dial tcp: i/o timeout');

    const clear = screen.getByRole('button', { name: 'Скрыть строки' });

    expect(clear).toHaveAccessibleDescription(/останутся в системном логе роутера/);

    act(() => {
      FakeLogSource.last().line(1, 'строка до очистки');
    });
    await screen.findByText('строка до очистки');

    await user.click(clear);

    await waitFor(() => {
      expect(cleared).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.queryByText('строка до очистки')).not.toBeInTheDocument();
    });
  });

  it('an unavailable log shows the failure reason, not an empty list', async () => {
    server.use(
      http.get(LOG_ENDPOINT.logs(), () =>
        HttpResponse.json({ code: 'log_unavailable', message: 'logread: exit 1' }, { status: 503 })
      )
    );

    renderScreen();

    expect(await screen.findByText('Не удалось получить лог sing-box')).toBeInTheDocument();
    expect(screen.getByText(/лог sing-box недоступен/)).toBeInTheDocument();
    expect(screen.queryByText('Строк нет')).not.toBeInTheDocument();
  });
});
