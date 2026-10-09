import { renderWithRouter } from '@test/renderWithRouter';
import { selectOption } from '@test/selectOption';
import { server } from '@test/server';
import { mockVirtualSizes } from '@test/virtualSizes';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LOG_ENDPOINT, LogStore } from '@entities/Log';
import { createLogHandlers } from '@entities/Log/__tests__/Log.handlers';

import { LogsPage } from '../ui/LogsPage';

/**
 * Поток лога в jsdom: `EventSource` там нет. Подмена помнит открытые потоки,
 * чтобы тест слал строки в последний и видел, с каким уровнем его открыли.
 */
class FakeLogSource {
  static readonly CLOSED = 2;
  static opened: FakeLogSource[] = [];

  readonly url: string;
  readyState = 0;
  closed = false;
  private readonly listeners = new Map<string, Set<(event: MessageEvent<string>) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeLogSource.opened.push(this);
  }

  addEventListener(type: string, handler: (event: MessageEvent<string>) => void): void {
    const set = this.listeners.get(type) ?? new Set();

    set.add(handler);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, handler: (event: MessageEvent<string>) => void): void {
    this.listeners.get(type)?.delete(handler);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, data = ''): void {
    for (const handler of this.listeners.get(type) ?? []) {
      handler(new MessageEvent(type, { data }));
    }
  }

  /** Строка лога в конверте демона. */
  line(seq: number, message: string, level = 'info'): void {
    this.emit('log', JSON.stringify({ seq, entry: { level, message } }));
  }

  static last(): FakeLogSource {
    const source = FakeLogSource.opened.at(-1);

    if (source === undefined) {
      throw new Error('Поток лога не открыт');
    }

    return source;
  }
}

function renderScreen() {
  return renderWithRouter(LogsPage, { path: '/logs' });
}

describe('экран логов', () => {
  beforeEach(() => {
    FakeLogSource.opened = [];
    vi.stubGlobal('EventSource', FakeLogSource);
    mockVirtualSizes({ row: 24 });
    // Слежение прокручивает список к последней строке, а прокрутки в jsdom нет.
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    LogStore.getState().reset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('показывает хвост лога с уровнем и источником', async () => {
    server.use(...createLogHandlers());

    renderScreen();

    expect(await screen.findByText('outbound/vless[proxy]: dial tcp: i/o timeout')).toBeInTheDocument();
    // По умолчанию уровень info: строки debug демон не отдаёт вовсе.
    expect(screen.queryByText('dns: exchanged example.com A 93.184.215.14')).not.toBeInTheDocument();
    expect(screen.getByText('источник: logread')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Лог sing-box' })).toHaveAttribute('aria-rowcount', '5');
  });

  it('уровень уходит и в запрос хвоста, и в поток', async () => {
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

  it('строки потока дописываются под хвост', async () => {
    server.use(...createLogHandlers());

    renderScreen();

    await screen.findByText('outbound/vless[proxy]: dial tcp: i/o timeout');

    act(() => {
      FakeLogSource.last().emit('open');
      FakeLogSource.last().line(1, 'router: новая строка из потока');
    });

    expect(await screen.findByText('router: новая строка из потока')).toBeInTheDocument();
    expect(screen.getByText('поток идёт')).toBeInTheDocument();
    expect(screen.queryByText(/Пропущен/)).not.toBeInTheDocument();
  });

  it('разрыв seq показывает, сколько строк потеряно', async () => {
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

  it('поток, которому демон отказал, предлагает переподключиться', async () => {
    const user = userEvent.setup();

    server.use(...createLogHandlers());

    renderScreen();

    await screen.findByText('outbound/vless[proxy]: dial tcp: i/o timeout');

    act(() => {
      const source = FakeLogSource.last();

      source.readyState = FakeLogSource.CLOSED;
      source.emit('error');
    });

    const alert = await screen.findByRole('alert');

    expect(within(alert).getByText('Поток лога закрыт')).toBeInTheDocument();

    await user.click(within(alert).getByRole('button', { name: 'Переподключить' }));

    expect(FakeLogSource.opened).toHaveLength(2);
    await waitFor(() => {
      expect(screen.queryByText('Поток лога закрыт')).not.toBeInTheDocument();
    });
  });

  it('очистка зовёт демон, снимает строки и объясняет, что кольцо logd не чистится', async () => {
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

    const clear = screen.getByRole('button', { name: 'Очистить' });

    expect(clear).toHaveAccessibleDescription(/кольцо logd не очищается/);

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

  it('недоступный лог показывает причину отказа, а не пустой список', async () => {
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
