import { renderWithQuery } from '@test/renderWithQuery';
import { server } from '@test/server';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PROXY_ENDPOINT } from '@entities/Proxy';
import { CLASH_PROVIDERS_FIXTURE } from '@entities/Proxy/__tests__/Proxy.fixture';
import { proxyHandlers } from '@entities/Proxy/__tests__/Proxy.handlers';
import { formatDateTime } from '@shared/lib/format';

import { ProxiesPage } from '../ui/ProxiesPage';

function serveProxies() {
  server.use(...proxyHandlers);
}

// The screen is brought up whole together with requests, so the test lives in `src/test`:
// from the `pages` layer the shared tooling cannot be reached without crossing layer boundaries.
describe('proxies screen', () => {
  it('shows config groups and does not show service ones', async () => {
    serveProxies();

    renderWithQuery(<ProxiesPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'proxy' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('heading', { name: 'GLOBAL' })).not.toBeInTheDocument();
  });

  it('the group heading is nested in the groups section, not at the same level as it', async () => {
    serveProxies();

    renderWithQuery(<ProxiesPage />);

    expect(await screen.findByRole('heading', { level: 3, name: 'proxy' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Группы узлов' })).toBeInTheDocument();
  });

  // Without a named threshold, 290 and 310 ms in different colors look like chance.
  it('names the latency tone thresholds with a legend above the groups', async () => {
    serveProxies();

    renderWithQuery(<ProxiesPage />);

    const legend = within(await screen.findByRole('list', { name: 'Цвет задержки' }));

    expect(legend.getByText('до 300 мс')).toBeInTheDocument();
    expect(legend.getByText('дольше 300 мс')).toBeInTheDocument();
    expect(legend.getByText('не ответил')).toBeInTheDocument();
  });

  // The selected node carries an edge and a checkmark; a separate "now: X" line
  // would repeat them as a third sign.
  it('does not duplicate the selected node with a line above the tiles', async () => {
    serveProxies();

    renderWithQuery(<ProxiesPage />);

    expect(await screen.findByRole('heading', { name: 'proxy' })).toBeInTheDocument();
    expect(screen.queryByText('сейчас:')).not.toBeInTheDocument();
  });

  it('switches a node only in a selector and sends the choice to the runtime', async () => {
    const selected = vi.fn<(body: unknown) => void>();

    serveProxies();
    server.use(
      http.put(PROXY_ENDPOINT.proxy('us-fallback'), async ({ request }) => {
        selected(await request.json());

        return new HttpResponse(null, { status: 204 });
      })
    );

    const user = userEvent.setup();

    renderWithQuery(<ProxiesPage />);

    const node = await screen.findByRole('button', { name: /proxy Группа|proxy/, pressed: false });

    await user.click(node);

    await waitFor(() => {
      expect(selected).toHaveBeenCalledWith({ name: 'proxy' });
    });
  });

  it('announces the node choice with the screen live region', async () => {
    serveProxies();

    const user = userEvent.setup();

    renderWithQuery(<ProxiesPage />);

    await user.click(await screen.findByRole('button', { name: /proxy Группа|proxy/, pressed: false }));

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'Результат действия' })).toHaveTextContent(
        'Группа us-fallback: выбран узел proxy'
      );
    });
  });

  it('announces the latency refresh of a group and of all groups', async () => {
    serveProxies();

    const user = userEvent.setup();

    renderWithQuery(<ProxiesPage />);

    await user.click(await screen.findByRole('button', { name: 'Проверить узлы группы us-fallback' }));

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'Результат действия' })).toHaveTextContent(
        'Группа us-fallback: задержка обновлена'
      );
    });

    await user.click(screen.getByRole('button', { name: 'Проверить все' }));

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'Результат действия' })).toHaveTextContent(
        'Задержка всех групп обновлена'
      );
    });
  });

  it('a URL-test node is not clickable: sing-box makes the choice there', async () => {
    serveProxies();

    renderWithQuery(<ProxiesPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'proxy' })).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /sub-eu\/eu-xhttp/ })).not.toBeInTheDocument();
  });

  it('shows the subscriptions the nodes come from', async () => {
    serveProxies();

    renderWithQuery(<ProxiesPage />);

    expect(await screen.findByText('sub-eu')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'Подписки' })).toHaveLength(1);
  });

  describe('subscription update time', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('labels "updated N ago", puts the full date in title, and the machine one in dateTime', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-10T15:30:00Z') });
      serveProxies();

      renderWithQuery(<ProxiesPage />);

      const label = await screen.findAllByText('обновлена 3 ч назад');

      expect(label[0]).toHaveAttribute('dateTime', CLASH_PROVIDERS_FIXTURE.providers['sub-eu'].updatedAt);
      expect(label[0]).toHaveAttribute('title', formatDateTime(new Date('2026-09-10T12:27:02Z')));
    });

    it('within a minute after the update writes "just now", not seconds', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-10T12:27:30Z') });
      serveProxies();

      renderWithQuery(<ProxiesPage />);

      expect(await screen.findAllByText('обновлена только что')).not.toHaveLength(0);
    });

    it('shows the runtime zero date as "not updated yet"', async () => {
      serveProxies();
      server.use(
        http.get(PROXY_ENDPOINT.providers(), () =>
          HttpResponse.json({
            providers: {
              fresh: {
                ...CLASH_PROVIDERS_FIXTURE.providers['sub-eu'],
                name: 'fresh',
                updatedAt: '0001-01-01T00:00:00Z',
              },
            },
          })
        )
      );

      renderWithQuery(<ProxiesPage />);

      expect(await screen.findByText('ещё не обновлялась')).toBeInTheDocument();
      expect(screen.queryByText(/назад/)).not.toBeInTheDocument();
    });

    it('shows traffic and expiry of a subscription when the subscription reported them', async () => {
      serveProxies();

      renderWithQuery(<ProxiesPage />);

      expect(await screen.findByText('873.7 МБ из 100.0 ГБ')).toBeInTheDocument();
      expect(screen.getByText('до 01.12.2026')).toBeInTheDocument();
    });

    it('rereads the time after a successful subscription update', async () => {
      let updatedAt = '2026-09-10T12:27:02Z';

      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-10T15:30:00Z') });
      serveProxies();
      server.use(
        http.get(PROXY_ENDPOINT.providers(), () =>
          HttpResponse.json({
            providers: { 'sub-eu': { ...CLASH_PROVIDERS_FIXTURE.providers['sub-eu'], updatedAt } },
          })
        ),
        http.put(PROXY_ENDPOINT.provider('sub-eu'), () => {
          updatedAt = '2026-09-10T15:29:50Z';

          return new HttpResponse(null, { status: 204 });
        })
      );

      const user = userEvent.setup({ advanceTimers: () => {} });

      renderWithQuery(<ProxiesPage />);

      expect(await screen.findByText('обновлена 3 ч назад')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Обновить подписку sub-eu' }));

      expect(await screen.findByText('обновлена только что')).toBeInTheDocument();
    });
  });

  it('updates a subscription by the button and keeps the button busy while the request runs', async () => {
    const updated = vi.fn<() => void>();
    let release = () => {};
    const answered = new Promise<void>((resolve) => {
      release = resolve;
    });

    serveProxies();
    server.use(
      http.put(PROXY_ENDPOINT.provider('sub-eu'), async () => {
        updated();
        await answered;

        return new HttpResponse(null, { status: 204 });
      })
    );

    const user = userEvent.setup();

    renderWithQuery(<ProxiesPage />);

    await user.click(await screen.findByRole('button', { name: 'Обновить подписку sub-eu' }));

    await waitFor(() => {
      expect(updated).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole('button', { name: 'Обновить подписку sub-eu' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Обновить подписку sub-nl' })).toBeEnabled();

    release();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Обновить подписку sub-eu' })).toBeEnabled();
    });
  });

  // In the fixture the us group is nested in us-fallback: its tile is checked.
  it('the tile of a nested group translates the type instead of showing it as a Clash API string', async () => {
    serveProxies();

    renderWithQuery(<ProxiesPage />);

    const nested = await screen.findByRole('button', { name: 'us, URL-тест, 609 мс' });

    expect(within(nested).getByText('URL-тест')).toBeInTheDocument();
    expect(within(nested).queryByText('URLTest')).not.toBeInTheDocument();
  });
});
