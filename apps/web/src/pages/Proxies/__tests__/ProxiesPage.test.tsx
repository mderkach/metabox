import { renderWithQuery } from '@test/renderWithQuery';
import { renderWithRouter } from '@test/renderWithRouter';
import { server } from '@test/server';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CONFIG_ENDPOINT,
  CONFIG_QUERY,
  ConfigDocumentStore,
  readSectionNodes,
  selectConfigCurrent,
} from '@entities/Config';
import { configHandlers } from '@entities/Config/__tests__/Config.handlers';
import { PROXY_ENDPOINT } from '@entities/Proxy';
import { CLASH_PROVIDERS_FIXTURE, CLASH_PROXIES_FIXTURE } from '@entities/Proxy/__tests__/Proxy.fixture';
import { proxyHandlers } from '@entities/Proxy/__tests__/Proxy.handlers';
import { formatDateTime } from '@shared/lib/format';

import { ProxiesPage } from '../ui/ProxiesPage';

function serveProxies() {
  server.use(...proxyHandlers, ...configHandlers);
}

/** Records which nodes were probed; `failing` answer as the fork does when a node is silent. */
function serveProbes(failing: readonly string[] = []) {
  const probed: string[] = [];

  server.use(
    http.get(PROXY_ENDPOINT.proxyDelay('*'), ({ request }) => {
      const name = decodeURIComponent(new URL(request.url).pathname.split('/').at(-2) ?? '');

      probed.push(name);

      return failing.includes(name)
        ? HttpResponse.json({ message: 'An error occurred in the delay test' }, { status: 503 })
        : HttpResponse.json({ delay: 100 });
    })
  );

  return probed;
}

/** The runtime list with some proxies replaced: the fork drops the history of a silent node. */
function serveProxyList(proxies: typeof CLASH_PROXIES_FIXTURE.proxies) {
  server.use(http.get(PROXY_ENDPOINT.proxies(), () => HttpResponse.json({ proxies })));
}

describe('proxies screen', () => {
  afterEach(() => {
    ConfigDocumentStore.getState().reset();
    localStorage.clear();
  });

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
    expect(screen.getByRole('heading', { level: 2, name: 'Группы прокси' })).toBeInTheDocument();
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
        'Группа us-fallback: выбран выход proxy'
      );
    });
  });

  it('announces the latency refresh of a group and of all groups', async () => {
    serveProxies();

    const user = userEvent.setup();

    renderWithQuery(<ProxiesPage />);

    await user.click(await screen.findByRole('button', { name: 'Проверить участников группы us-fallback' }));

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'Результат действия' })).toHaveTextContent(
        'Группа us-fallback: задержка обновлена'
      );
    });

    await user.click(screen.getByRole('button', { name: 'Проверить все' }));

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'Результат действия' })).toHaveTextContent('Замеры задержки обновлены');
    });
  });

  it('tests every node of a group, not only the one the group uses now', async () => {
    serveProxies();
    const probed = serveProbes();
    const user = userEvent.setup();

    renderWithQuery(<ProxiesPage />);

    await user.click(await screen.findByRole('button', { name: 'Проверить участников группы proxy' }));

    await waitFor(() => {
      expect(probed.toSorted()).toEqual([
        'sub-eu/eu-reality',
        'sub-eu/eu-xhttp',
        'sub-nl/nl-reality',
        'sub-nl/nl-xhttp',
      ]);
    });
  });

  it('shows a node that did not answer the probe as failed, not as never tested', async () => {
    serveProxies();
    serveProbes(['us']);
    serveProxyList({ ...CLASH_PROXIES_FIXTURE.proxies, us: { ...CLASH_PROXIES_FIXTURE.proxies.us, history: [] } });
    const user = userEvent.setup();

    renderWithQuery(<ProxiesPage />);

    expect(await screen.findByRole('button', { name: /^us, .*, не проверялся$/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Проверить участников группы us-fallback' }));

    expect(await screen.findByRole('button', { name: /^us, .*, не ответил$/ })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Результат действия' })).toHaveTextContent(
      'Группа us-fallback: задержка обновлена'
    );
  });

  describe('REALITY recovery hint', () => {
    const tag = 'us';
    const etag = '"applied-reality"';
    const hint = 'Диагностика сервера us';
    const outbound = {
      type: 'vless',
      tag,
      server: 'server.example',
      server_port: 443,
      uuid: '01234567-89ab-4cde-8123-456789abcdef',
      tls: { enabled: true, reality: { enabled: true } },
    };

    function mockApplied(outbounds: readonly unknown[]) {
      const text = JSON.stringify({ outbounds });

      server.use(http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(text, { headers: { ETag: etag } })));

      return text;
    }

    async function checkGroup(group = 'us-fallback') {
      const user = userEvent.setup();
      const button = screen.getByRole('button', { name: `Проверить участников группы ${group}` });

      await user.click(button);
      await waitFor(() => expect(button).toBeEnabled());
    }

    async function openProxies(
      outbounds: readonly unknown[] = [outbound],
      runtimeType = 'VLESS',
      extraProxies: typeof CLASH_PROXIES_FIXTURE.proxies = {}
    ) {
      serveProxies();
      const text = mockApplied(outbounds);
      serveProxyList({
        ...CLASH_PROXIES_FIXTURE.proxies,
        us: { ...CLASH_PROXIES_FIXTURE.proxies.us, type: runtimeType, history: [] },
        ...extraProxies,
      });
      const view = renderWithRouter(ProxiesPage);

      await screen.findByRole('heading', { name: 'us-fallback' });
      await waitFor(() => {
        expect(view.queryClient.getQueryData(CONFIG_QUERY.current())).toEqual({ text, etag });
      });

      return { text, ...view };
    }

    it('opens collapsed REALITY diagnostics in the tested group and edits only the corresponding server in the draft', async () => {
      const { text } = await openProxies();
      serveProbes([tag]);

      ConfigDocumentStore.getState().load(text, etag);
      const direct = { type: 'direct', tag: 'direct' };
      ConfigDocumentStore.getState().edit(['outbounds'], [direct, outbound]);

      await checkGroup();

      const user = userEvent.setup();
      const group = screen.getByRole('group', { name: 'us-fallback' });
      const button = await within(group).findByRole('button', { name: hint });
      expect(button).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('heading', { name: 'Совместимость REALITY' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /Открыть настройки сервера/ })).not.toBeInTheDocument();

      await user.click(button);
      expect(button).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText(/Если сервер REALITY недавно обновили/)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Включить гибридный обмен ключами в черновике' }));
      expect(readSectionNodes(selectConfigCurrent(ConfigDocumentStore.getState()) ?? '', 'outbounds')).toEqual([
        direct,
        { ...outbound, tls: { enabled: true, reality: { enabled: true, support_x25519mlkem768: true } } },
      ]);
      expect(ConfigDocumentStore.getState().applied).toBe(text);
      expect(screen.getByText(/Гибридный обмен ключами включён в черновике/)).toBeInTheDocument();
    });

    it('places only one diagnostic for a server shown in two groups', async () => {
      await openProxies([outbound], 'VLESS', {
        'second-group': { type: 'URLTest', name: 'second-group', udp: true, history: [], all: [tag] },
      });
      serveProbes([tag]);

      await checkGroup('second-group');

      const group = screen.getByRole('group', { name: 'second-group' });
      expect(await within(group).findByRole('button', { name: hint })).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: hint })).toHaveLength(1);
    });

    it('clears the REALITY hint on a successful check or a changed applied config', async () => {
      const { queryClient, text } = await openProxies();
      serveProbes([tag]);

      await checkGroup();
      expect(await screen.findByRole('button', { name: hint })).toBeInTheDocument();

      serveProbes();
      await checkGroup();
      await waitFor(() => expect(screen.queryByRole('button', { name: hint })).not.toBeInTheDocument());

      serveProbes([tag]);
      await checkGroup();
      expect(await screen.findByRole('button', { name: hint })).toBeInTheDocument();

      act(() => {
        queryClient.setQueryData(CONFIG_QUERY.current(), { text, etag: '"new-config"' });
      });
      await waitFor(() => expect(screen.queryByRole('button', { name: hint })).not.toBeInTheDocument());
    });

    it('does not offer REALITY recovery when the runtime tag belongs to a group', async () => {
      await openProxies([outbound], 'URLTest');
      serveProbes([tag]);

      await checkGroup();
      expect(screen.queryByRole('button', { name: hint })).not.toBeInTheDocument();
    });

    it('does not show the REALITY hint for a daemon error or a node without an eligible edit', async () => {
      const { queryClient } = await openProxies([
        { ...outbound, tls: { enabled: true, reality: { enabled: true, support_x25519mlkem768: true } } },
      ]);
      serveProbes([tag]);

      await checkGroup();
      await waitFor(() => expect(screen.queryByRole('button', { name: hint })).not.toBeInTheDocument());

      act(() => {
        queryClient.setQueryData(CONFIG_QUERY.current(), { text: JSON.stringify({ outbounds: [outbound] }), etag });
      });
      await checkGroup();
      expect(await screen.findByRole('button', { name: hint })).toBeInTheDocument();

      server.use(
        http.get(PROXY_ENDPOINT.proxyDelay(tag), () =>
          HttpResponse.json({ code: 'core_down', message: 'Core down' }, { status: 503 })
        )
      );

      await checkGroup();
      await waitFor(() => expect(screen.queryByRole('button', { name: hint })).not.toBeInTheDocument());
    });
  });

  it('tests the config outbounds when the config has no groups', async () => {
    serveProxies();
    const probed = serveProbes();
    const { direct, 'sub-eu/eu-reality': node } = CLASH_PROXIES_FIXTURE.proxies;

    serveProxyList({ direct, 'sub-eu/eu-reality': node });
    const user = userEvent.setup();

    renderWithQuery(<ProxiesPage />);

    await user.click(await screen.findByRole('button', { name: 'Проверить выходы конфига' }));

    await waitFor(() => {
      expect(probed.toSorted()).toEqual(['direct', 'sub-eu/eu-reality']);
    });
    expect(screen.getByRole('button', { name: 'Проверить все' })).toBeEnabled();
  });

  it('explains an automatic group and adds a manual choice over it to the draft only', async () => {
    serveProxies();
    const user = userEvent.setup();

    renderWithQuery(<ProxiesPage />);

    expect((await screen.findAllByText(/Ядро само выбирает участника/)).length).toBeGreaterThan(0);

    // `us` is not an outbound of the file: there is nothing to wrap, and no action is offered.
    expect(screen.queryByRole('button', { name: 'Добавить выбор вручную для группы us' })).not.toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Добавить выбор вручную для группы proxy' }));

    const outbounds = readSectionNodes(selectConfigCurrent(ConfigDocumentStore.getState()) ?? '', 'outbounds');

    expect(outbounds).toContainEqual({
      type: 'selector',
      tag: 'proxy',
      outbounds: ['proxy-auto', 'node-a-vless-reality'],
      providers: ['sub-a', 'sub-c'],
    });
    expect(outbounds).toContainEqual(expect.objectContaining({ type: 'urltest', tag: 'proxy-auto' }));
    expect(screen.getByText(/Выбор вручную добавлен в черновик/)).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Добавить выбор вручную для группы proxy' })).not.toBeInTheDocument();
  });

  // Manual choice reads only the config text; list files matter to Apply, and the apply bar loads them once a draft exists.
  it('loads the config file for manual choice, not the rule-set list files', async () => {
    serveProxies();
    const listsRequested = vi.fn<() => void>();

    server.use(
      http.get(CONFIG_ENDPOINT.ruleSetFiles(), () => {
        listsRequested();

        return HttpResponse.json({ files: {}, etag: '"lists"' });
      })
    );

    renderWithQuery(<ProxiesPage />);

    expect(await screen.findByRole('button', { name: 'Добавить выбор вручную для группы proxy' })).toBeInTheDocument();
    expect(listsRequested).not.toHaveBeenCalled();
  });

  it('a URL-test node is not clickable: sing-box makes the choice there', async () => {
    serveProxies();

    renderWithQuery(<ProxiesPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'proxy' })).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /^sub-eu\/eu-xhttp/ })).not.toBeInTheDocument();
  });

  it('shows the subscriptions the nodes come from', async () => {
    serveProxies();

    renderWithQuery(<ProxiesPage />);

    expect(await screen.findByText('sub-eu')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'Подписки' })).toHaveLength(1);
  });

  it('shows provider failures with a retry while proxy groups remain available', async () => {
    serveProxies();
    server.use(http.get(PROXY_ENDPOINT.providers(), () => new HttpResponse(null, { status: 500 })));
    const user = userEvent.setup();

    renderWithQuery(<ProxiesPage />);

    expect(await screen.findByRole('heading', { name: 'proxy' })).toBeInTheDocument();
    expect(await screen.findByText('Не удалось получить подписки')).toBeInTheDocument();

    server.use(http.get(PROXY_ENDPOINT.providers(), () => HttpResponse.json(CLASH_PROVIDERS_FIXTURE)));
    await user.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(await screen.findByText('sub-eu')).toBeInTheDocument();
  });

  it('keeps the provider loading state visible after proxy groups have loaded', async () => {
    let release = () => {};
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });

    serveProxies();
    server.use(
      http.get(PROXY_ENDPOINT.providers(), async () => {
        await ready;

        return HttpResponse.json(CLASH_PROVIDERS_FIXTURE);
      })
    );
    renderWithQuery(<ProxiesPage />);

    expect(await screen.findByRole('heading', { name: 'proxy' })).toBeInTheDocument();
    expect(screen.getByText('Загружаю')).toBeInTheDocument();

    release();
    expect(await screen.findByText('sub-eu')).toBeInTheDocument();
  });

  it('keeps loaded subscriptions visible after their refetch fails', async () => {
    serveProxies();
    const user = userEvent.setup();

    renderWithQuery(<ProxiesPage />);
    expect(await screen.findByText('sub-eu')).toBeInTheDocument();

    const refetched = vi.fn<() => void>();

    server.use(
      http.get(PROXY_ENDPOINT.providers(), () => {
        refetched();

        return new HttpResponse(null, { status: 500 });
      })
    );
    await user.click(screen.getByRole('button', { name: 'Обновить подписку sub-eu' }));
    await waitFor(() => {
      expect(refetched).toHaveBeenCalledOnce();
      expect(screen.getByRole('button', { name: 'Обновить подписку sub-eu' })).toBeEnabled();
    });
    expect(screen.getByText('sub-eu')).toBeInTheDocument();
    expect(screen.queryByText('Не удалось получить подписки')).not.toBeInTheDocument();
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

  describe('node count after a subscription update', () => {
    const SUB = CLASH_PROVIDERS_FIXTURE.providers['sub-eu'];
    const NODE = SUB.proxies[0];

    /** A subscription of six nodes whose update leaves `left` of them, as the fork does. */
    function serveShrinkingSubscription(left: number) {
      let proxies = Array.from({ length: 6 }, (_, index) => ({ ...NODE, name: `sub-eu/node-${index}` }));
      let updatedAt = SUB.updatedAt;

      serveProxies();
      server.use(
        http.get(PROXY_ENDPOINT.providers(), () =>
          HttpResponse.json({ providers: { 'sub-eu': { ...SUB, updatedAt, proxies } } })
        ),
        http.put(PROXY_ENDPOINT.provider('sub-eu'), () => {
          proxies = proxies.slice(0, left);
          updatedAt = '2026-09-11T12:00:00Z';

          return new HttpResponse(null, { status: 204 });
        })
      );
    }

    it('shows the previous count and warns when the set collapses', async () => {
      serveShrinkingSubscription(1);
      const user = userEvent.setup();

      renderWithQuery(<ProxiesPage />);

      expect(await screen.findByText('6 серверов')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Обновить подписку sub-eu' }));

      expect(await screen.findByText('1 сервер, было 6')).toBeInTheDocument();
      // A status region, so the drop is announced after the update, not only drawn.
      expect(
        screen.getAllByRole('status').filter((region) => /осталось 1 из 6 серверов/.test(region.textContent))
      ).toHaveLength(1);
    });

    it('warns when the update leaves no nodes', async () => {
      serveShrinkingSubscription(0);
      const user = userEvent.setup();

      renderWithQuery(<ProxiesPage />);

      await user.click(await screen.findByRole('button', { name: 'Обновить подписку sub-eu' }));

      expect(await screen.findByText('0 серверов, было 6')).toBeInTheDocument();
      expect(screen.getByText(/В подписке не осталось серверов/)).toBeInTheDocument();
    });

    it('shows the previous count without a warning on a moderate change', async () => {
      serveShrinkingSubscription(4);
      const user = userEvent.setup();

      renderWithQuery(<ProxiesPage />);

      await user.click(await screen.findByRole('button', { name: 'Обновить подписку sub-eu' }));

      expect(await screen.findByText('4 сервера, было 6')).toBeInTheDocument();
      expect(screen.queryByText(/осталось/)).not.toBeInTheDocument();
    });

    it('notices a drop the core made while the panel was closed', async () => {
      localStorage.setItem(
        'metabox.proxy.providers',
        JSON.stringify({ 'sub-eu': { nodes: 12, updatedAt: '2026-09-09T12:00:00Z', previous: null } })
      );
      serveProxies();
      server.use(http.get(PROXY_ENDPOINT.providers(), () => HttpResponse.json({ providers: { 'sub-eu': SUB } })));

      renderWithQuery(<ProxiesPage />);

      expect(await screen.findByText('2 сервера, было 12')).toBeInTheDocument();
      expect(screen.getByText(/осталось 2 из 12 серверов/)).toBeInTheDocument();
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
  it('the tile of a nested group is named a group and translates its type instead of the Clash API string', async () => {
    serveProxies();

    renderWithQuery(<ProxiesPage />);

    const nested = await screen.findByRole('button', { name: 'us, группа · выбирает сама по задержке, 609 мс' });

    expect(within(nested).getByText('группа · выбирает сама по задержке')).toBeInTheDocument();
    expect(within(nested).queryByText('URLTest')).not.toBeInTheDocument();
  });
});
