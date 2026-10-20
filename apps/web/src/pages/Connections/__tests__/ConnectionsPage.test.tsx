import { renderWithRouter } from '@test/renderWithRouter';
import { server } from '@test/server';
import { mockVirtualSizes } from '@test/virtualSizes';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CONFIG_ENDPOINT } from '@entities/Config';
import { CONFIG_FIXTURE } from '@entities/Config/__tests__/Config.fixture';
import { CLOSED_LIMIT, ConnectionStore, parseConnectionSearch } from '@entities/Connection';
import { CONNECTION_ENDPOINT } from '@entities/Connection';
import { CONNECTIONS_FIXTURE, makeConnectionsSnapshot } from '@entities/Connection/__tests__/Connection.fixture';
import { createDeviceHandlers } from '@entities/Device/__tests__/Device.handlers';
import { ROUTE_DRIFTED_CHAIN_FIXTURE } from '@entities/Route/__tests__/Route.fixture';
import { createRouteHandlers } from '@entities/Route/__tests__/Route.handlers';

import { ConnectionsPage } from '../ui/ConnectionsPage';

/** Tag `direct` on a node of type `selector`: by name such a row would be read as direct. */
const PROXY_NAMED_DIRECT = { outbounds: [{ type: 'selector', tag: 'direct', outbounds: ['proxy'] }] };

/** Config from the device: the row action is colored by its outbound type, not by the tag. */
function serveConfig(config: unknown = CONFIG_FIXTURE) {
  server.use(http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(JSON.stringify(config))));
}

/** Opens a facet and returns its value list. The sort in the header is labeled the same, so we look in the toolbar. */
async function openFacet(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(within(await screen.findByRole('group', { name: 'Фильтры' })).getByRole('button', { name }));

  return screen.findByRole('listbox');
}

/** The screen filter lives in the address, so it is mounted on its own route. */
function renderScreen(search = '') {
  return renderWithRouter(ConnectionsPage, {
    path: '/connections',
    validateSearch: parseConnectionSearch,
    initialEntry: `/connections${search}`,
  });
}

describe('connections screen', () => {
  beforeEach(() => {
    ConnectionStore.getState().reset();
    mockVirtualSizes();
    serveConfig();
  });

  afterEach(() => {
    // `reset` does not touch the type map, and the next test waits for parsing by tag.
    ConnectionStore.getState().setOutboundTypes(new Map());
    vi.restoreAllMocks();
  });

  it('on thousands of connections keeps a window in the DOM, not the whole list', async () => {
    ConnectionStore.getState().apply(makeConnectionsSnapshot(5000));
    renderScreen();

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Закрыть соединение/ }).length).toBeGreaterThan(0);
    });

    const rendered = screen.getAllByRole('button', { name: /Закрыть соединение/ });

    expect(rendered.length).toBeLessThan(100);
  });

  it('closes a connection at the address from the shared constant', async () => {
    const closed = vi.fn<(id: string) => void>();

    server.use(
      http.delete(`${CONNECTION_ENDPOINT.connections()}/:id`, ({ params }) => {
        closed(String(params.id));

        return new HttpResponse(null, { status: 204 });
      })
    );

    const user = userEvent.setup();

    ConnectionStore.getState().apply(makeConnectionsSnapshot(3));
    renderScreen();

    const button = await screen.findAllByRole('button', { name: /Закрыть соединение/ });

    await user.click(button[0]);

    await waitFor(() => {
      expect(closed).toHaveBeenCalledTimes(1);
    });
    // The row leaves the list silently: the screen live region announces the close.
    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'Результат действия' })).toHaveTextContent('Соединение закрыто');
    });
  });

  it('on pause new snapshots do not change the screen', async () => {
    const user = userEvent.setup();

    renderScreen();
    ConnectionStore.getState().apply(makeConnectionsSnapshot(3));

    await user.click(await screen.findByRole('button', { name: 'Пауза' }));
    ConnectionStore.getState().apply(makeConnectionsSnapshot(40));

    expect(ConnectionStore.getState().active).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeInTheDocument();
  });

  it('the header names the pause, and a live stream is not labeled', async () => {
    const user = userEvent.setup();

    renderScreen();

    const header = await screen.findByRole('banner');

    expect(within(header).queryByText('на паузе: строки не обновляются')).not.toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Пауза' }));

    expect(within(header).getByText('на паузе: строки не обновляются')).toBeInTheDocument();
  });

  it('drops all connections only after confirmation', async () => {
    const closedAll = vi.fn<() => void>();

    server.use(
      http.delete(CONNECTION_ENDPOINT.connections(), () => {
        closedAll();

        return new HttpResponse(null, { status: 204 });
      })
    );

    const user = userEvent.setup();

    ConnectionStore.getState().apply(makeConnectionsSnapshot(3));
    renderScreen();

    await user.click(await screen.findByRole('button', { name: 'Закрыть все' }));

    const dialog = await screen.findByRole('alertdialog');

    expect(dialog).toHaveTextContent('Оборвать все живые соединения?');
    expect(closedAll).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(closedAll).not.toHaveBeenCalled();

    await user.click(await screen.findByRole('button', { name: 'Закрыть все' }));
    await user.click(await screen.findByRole('button', { name: 'Оборвать' }));

    await waitFor(() => {
      expect(closedAll).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'Результат действия' })).toHaveTextContent(
        'Все живые соединения оборваны'
      );
    });
  });

  it('the action facet filters rows and names the selection on the button', async () => {
    const user = userEvent.setup();

    ConnectionStore.getState().apply(makeConnectionsSnapshot(8));
    renderScreen();

    const kinds = await openFacet(user, /^Действие$/);
    const direct = within(kinds).getByRole('option', { name: /напрямую/ });

    await user.click(direct);

    expect(direct).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => {
      expect(screen.getByText('Показано 4 из 8')).toHaveAttribute('role', 'status');
    });
    expect(screen.getByRole('button', { name: 'Действие: напрямую' })).toBeInTheDocument();
  });

  it('several values of one facet are added, not narrowed', async () => {
    const user = userEvent.setup();

    const { router } = renderScreen();
    ConnectionStore.getState().apply(makeConnectionsSnapshot(8));

    const kinds = await openFacet(user, /^Действие$/);

    await user.click(within(kinds).getByRole('option', { name: /напрямую/ }));
    await user.click(within(kinds).getByRole('option', { name: /через прокси/ }));

    await waitFor(() => {
      expect(router.state.location.search).toEqual({ kind: ['direct', 'proxy'] });
    });
    expect(screen.getByRole('button', { name: 'Действие: выбрано 2' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('8 соединений')).toHaveAttribute('role', 'status');
    });
  });

  it('takes the row action from the config outbound type, not from its tag', async () => {
    const user = userEvent.setup();

    serveConfig(PROXY_NAMED_DIRECT);
    ConnectionStore.getState().apply(makeConnectionsSnapshot(8));
    renderScreen();

    const kinds = await openFacet(user, /^Действие$/);

    // Four `route(direct)` rows by tag would be read as direct.
    await waitFor(() => {
      expect(within(kinds).queryByRole('option', { name: /напрямую/ })).not.toBeInTheDocument();
    });
    expect(within(kinds).getByRole('option', { name: /через прокси/ })).toHaveTextContent('8');
  });

  it('on the closed tab says how long they are kept', async () => {
    const user = userEvent.setup();

    renderScreen();
    ConnectionStore.getState().apply(makeConnectionsSnapshot(4));
    ConnectionStore.getState().apply(makeConnectionsSnapshot(1));

    const closedTab = await screen.findByRole('tab', { name: /Закрытые/ });

    // The explanation stands above the list card and only on the closed tab.
    expect(screen.queryByText(/хранятся, пока открыта вкладка/)).not.toBeInTheDocument();

    await user.click(closedTab);

    expect(await screen.findByText(/хранятся, пока открыта вкладка/)).toBeInTheDocument();
  });

  it('in the closed footer names those evicted by the limit', async () => {
    const user = userEvent.setup();

    renderScreen();
    ConnectionStore.getState().apply(makeConnectionsSnapshot(CLOSED_LIMIT + 50));
    ConnectionStore.getState().apply(makeConnectionsSnapshot(0));

    await user.click(await screen.findByRole('tab', { name: /Закрытые/ }));

    await waitFor(() => {
      expect(
        within(screen.getByRole('tabpanel')).getByText('показано 200 из 250 закрытых, остальные вытеснены')
      ).toBeInTheDocument();
    });
  });

  it('until the limit is reached stays silent about eviction', async () => {
    const user = userEvent.setup();

    renderScreen();
    ConnectionStore.getState().apply(makeConnectionsSnapshot(4));
    ConnectionStore.getState().apply(makeConnectionsSnapshot(0));

    await user.click(await screen.findByRole('tab', { name: /Закрытые/ }));

    await waitFor(() => {
      expect(within(screen.getByRole('tabpanel')).getByRole('status')).toHaveTextContent('4 соединения');
    });
    expect(screen.queryByText(/вытеснены/)).not.toBeInTheDocument();
  });

  // Filter in the address: a link to a filtered list is shared when
  // asking why traffic goes the wrong way.
  it('restores the slice from the address', async () => {
    renderScreen('?kind=direct');
    ConnectionStore.getState().apply(makeConnectionsSnapshot(4));

    expect(await screen.findByRole('button', { name: 'Действие: напрямую' })).toBeInTheDocument();
  });

  // The devices screen links here: "connections of this device".
  it('an old link with one device filters its rows', async () => {
    renderScreen('?source=192.168.1.60');
    ConnectionStore.getState().apply(CONNECTIONS_FIXTURE);

    expect(await screen.findByText('api.git.example:443')).toBeInTheDocument();
    expect(screen.queryByText('video.example:443')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Устройство: / })).toBeInTheDocument();
  });

  it('a rule without conditions is selectable and survives the trip through the address', async () => {
    const user = userEvent.setup();

    const { router } = renderScreen();
    ConnectionStore.getState().apply(CONNECTIONS_FIXTURE);

    await user.click(within(await openFacet(user, /^Правило$/)).getByRole('option', { name: /без условий/ }));

    await waitFor(() => {
      expect(router.state.location.search).toEqual({ match: '' });
    });

    const { searchStr } = router.state.location;

    expect(parseConnectionSearch(router.options.parseSearch(searchStr))).toEqual({ match: '' });
    expect(screen.getByRole('button', { name: 'Правило: без условий' })).toBeInTheDocument();
  });

  it('a selected device that is not in the snapshot stays in the facet with zero and is cleared by hand', async () => {
    const user = userEvent.setup();

    const { router } = renderScreen('?source=192.168.1.200');
    ConnectionStore.getState().apply(makeConnectionsSnapshot(4));

    const sources = await openFacet(user, /^Устройство: /);
    const gone = within(sources).getByRole('option', { name: /192\.168\.1\.200/ });

    expect(gone).toHaveAttribute('aria-selected', 'true');
    expect(gone).toHaveTextContent(/0$/);

    await user.click(gone);

    await waitFor(() => {
      expect(router.state.location.search).toEqual({});
    });
  });

  it('the header of a column by whose field a facet is set carries a filter mark', async () => {
    renderScreen('?kind=direct');
    ConnectionStore.getState().apply(makeConnectionsSnapshot(4));

    expect(await screen.findByRole('columnheader', { name: /Действие/ })).toHaveTextContent('есть отбор');
    expect(screen.getByRole('columnheader', { name: /Куда/ })).not.toHaveTextContent('есть отбор');
  });

  it('an empty screen caused by a filter clears both search and facets', async () => {
    const user = userEvent.setup();

    const { router } = renderScreen('?q=claude&kind=block');
    ConnectionStore.getState().apply(makeConnectionsSnapshot(4));

    await user.click(await screen.findByRole('button', { name: 'Сбросить отбор' }));

    await waitFor(() => {
      expect(router.state.location.search).toEqual({});
    });
    expect(await screen.findByText('4 соединения')).toHaveAttribute('role', 'status');
  });

  it('"Reset all" clears facets and keeps the typed search', async () => {
    const user = userEvent.setup();

    const { router } = renderScreen('?q=example&kind=direct&source=192.168.1.60');
    ConnectionStore.getState().apply(makeConnectionsSnapshot(4));

    await user.click(await screen.findByRole('button', { name: 'Сбросить всё' }));

    await waitFor(() => {
      expect(router.state.location.search).toEqual({ q: 'example' });
    });
    expect(screen.queryByRole('button', { name: 'Сбросить всё' })).not.toBeInTheDocument();
  });

  it('finds a connection by device name although the row holds an address', async () => {
    server.use(...createDeviceHandlers());
    const user = userEvent.setup();

    renderScreen();
    ConnectionStore.getState().apply(CONNECTIONS_FIXTURE);

    const sources = await openFacet(user, /^Устройство$/);

    // The label arrives by request: wait for it before searching by it.
    await within(sources).findByRole('option', { name: /Ноутбук/ });
    await user.keyboard('{Escape}');
    await user.type(screen.getByRole('textbox', { name: 'Поиск по соединениям' }), 'ноутбук');

    await waitFor(() => {
      expect(screen.queryByText('video.example:443')).not.toBeInTheDocument();
    });
    expect(screen.getByText('api.git.example:443')).toBeInTheDocument();
  });

  it('the facet labels a device with the name, and writes the IP into the address', async () => {
    server.use(...createDeviceHandlers());
    const user = userEvent.setup();

    const { router } = renderScreen();
    ConnectionStore.getState().apply(CONNECTIONS_FIXTURE);

    const sources = await openFacet(user, /^Устройство$/);
    const laptop = await within(sources).findByRole('option', { name: /Ноутбук/ });

    // The address stands next to the name: it is used to cross-check with the router logs.
    expect(laptop).toHaveTextContent('192.168.1.60');

    await user.click(laptop);

    await waitFor(() => {
      expect(router.state.location.search).toEqual({ source: '192.168.1.60' });
    });
  });

  it('writes the slice into the address, not into the navigation history', async () => {
    const user = userEvent.setup();

    const { router } = renderScreen();
    ConnectionStore.getState().apply(makeConnectionsSnapshot(4));

    const kinds = await openFacet(user, /^Действие$/);

    await user.click(within(kinds).getByRole('option', { name: /напрямую/ }));

    await waitFor(() => {
      expect(router.state.location.search).toEqual({ kind: 'direct' });
    });
    expect(router.history.length).toBe(1);
  });

  it('explains the route with a panel next to the list', async () => {
    server.use(...createRouteHandlers(CONNECTIONS_FIXTURE.connections));
    const user = userEvent.setup();

    ConnectionStore.getState().apply(makeConnectionsSnapshot(3));
    renderScreen();

    const [explain] = await screen.findAllByRole('button', { name: /Почему соединение/ });

    await user.click(explain);

    expect(await screen.findByRole('complementary', { name: /Маршрут соединения/ })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the explained connection from the panel: the panel covers the row button', async () => {
    const closed = vi.fn<(id: string) => void>();

    server.use(
      ...createRouteHandlers(CONNECTIONS_FIXTURE.connections),
      http.delete(`${CONNECTION_ENDPOINT.connections()}/:id`, ({ params }) => {
        closed(String(params.id));

        return new HttpResponse(null, { status: 204 });
      })
    );
    const user = userEvent.setup();

    ConnectionStore.getState().apply(CONNECTIONS_FIXTURE);
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /Почему соединение api\.git\.example/ }));

    const panel = await screen.findByRole('complementary', { name: /api\.git\.example/ });

    await user.click(within(panel).getByRole('button', { name: /Закрыть соединение api\.git\.example/ }));

    await waitFor(() => {
      expect(closed).toHaveBeenCalledTimes(1);
    });
  });

  it('each row has its own explanation with the chain of that row', async () => {
    server.use(...createRouteHandlers(CONNECTIONS_FIXTURE.connections));
    const user = userEvent.setup();

    ConnectionStore.getState().apply(CONNECTIONS_FIXTURE);
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /Почему соединение api\.git\.example/ }));

    const panel = await screen.findByRole('complementary', { name: /api\.git\.example/ });

    expect(await within(panel).findByRole('list', { name: 'Цепочка прокси' })).toHaveTextContent(
      'proxysub-eu/eu-reality'
    );
  });

  // The row chain came with the stream snapshot, the panel chain with a separate handler
  // later: they diverge in the regular case (ADR-0007), and the panel shows its own, without
  // replacing it with the row chain.
  it('shows the explanation chain when it diverged from the row chain', async () => {
    server.use(...createRouteHandlers(CONNECTIONS_FIXTURE.connections));
    const user = userEvent.setup();

    ConnectionStore.getState().apply(CONNECTIONS_FIXTURE);
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /Почему соединение clients\.google\.example/ }));

    const panel = await screen.findByRole('complementary', { name: /clients\.google\.example/ });
    const chain = await within(panel).findByRole('list', { name: 'Цепочка прокси' });

    expect(chain).toHaveTextContent([...ROUTE_DRIFTED_CHAIN_FIXTURE.chain.nodes].reverse().join(''));
    expect(screen.queryByTitle(/us-hysteria/)).not.toBeInTheDocument();
  });

  it('search and slices stand on the screen once, not in every tab', async () => {
    ConnectionStore.getState().apply(makeConnectionsSnapshot(8));
    renderScreen();

    await screen.findAllByRole('button', { name: /Закрыть соединение/ });

    // The hidden tab is in the DOM too, so hidden nodes are counted as well.
    expect(screen.getAllByRole('textbox', { name: 'Поиск по соединениям', hidden: true })).toHaveLength(1);
    expect(screen.getAllByRole('group', { name: 'Фильтры', hidden: true })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Пауза', hidden: true })).toHaveLength(1);
  });

  it('the hidden tab stands on a snapshot, and the number on its label is live', async () => {
    const user = userEvent.setup();

    renderScreen();

    const closedTab = await screen.findByRole('tab', { name: /Закрытые/ });
    const [, closedPanel] = screen.getAllByRole('tabpanel', { hidden: true });

    act(() => {
      ConnectionStore.getState().apply(makeConnectionsSnapshot(4));
      ConnectionStore.getState().apply(makeConnectionsSnapshot(1));
    });

    expect(closedTab).toHaveTextContent('3');
    // Hidden tab rows are not filtered and not drawn for every snapshot.
    expect(within(closedPanel).getByRole('status', { hidden: true })).toHaveTextContent('0 соединений');

    await user.click(closedTab);

    // The open tab shows the current set at once, not a snapshot.
    expect(within(closedPanel).getByRole('status')).toHaveTextContent('3 соединения');
  });

  it('switching tabs keeps the facets', async () => {
    const user = userEvent.setup();

    ConnectionStore.getState().apply(makeConnectionsSnapshot(8));
    renderScreen();

    await user.click(within(await openFacet(user, /^Действие$/)).getByRole('option', { name: /напрямую/ }));
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('tab', { name: /Закрытые/ }));
    await user.click(screen.getByRole('tab', { name: /Активные/ }));

    expect(screen.getByRole('button', { name: 'Действие: напрямую' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Показано 4 из 8')).toHaveAttribute('role', 'status');
    });
  });
});

describe('connections screen on a phone', () => {
  beforeEach(() => {
    ConnectionStore.getState().reset();
    mockVirtualSizes();
    serveConfig();
    vi.stubGlobal('matchMedia', function matchNarrowQuery(media: string) {
      return { matches: true, media, addEventListener: vi.fn<() => void>(), removeEventListener: vi.fn<() => void>() };
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('holds the facets with the same buttons as on a wide screen, without a value cloud', async () => {
    const user = userEvent.setup();

    ConnectionStore.getState().apply(makeConnectionsSnapshot(8));
    renderScreen();

    const group = await screen.findByRole('group', { name: 'Фильтры' });

    expect(within(group).getAllByRole('button')).toHaveLength(5);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await user.click(within(group).getByRole('button', { name: 'Действие' }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: /напрямую/ }));

    expect(await screen.findByRole('button', { name: 'Действие: напрямую' })).toBeInTheDocument();
  });

  // On a phone the toolbar wraps, and a separate button would sit under the search,
  // in the thumb zone: the drop goes into the list menu behind a confirmation.
  it('closes all connections only through the list menu and confirmation', async () => {
    const closedAll = vi.fn<() => void>();

    server.use(
      http.delete(CONNECTION_ENDPOINT.connections(), () => {
        closedAll();

        return new HttpResponse(null, { status: 204 });
      })
    );

    const user = userEvent.setup();

    ConnectionStore.getState().apply(makeConnectionsSnapshot(3));
    renderScreen();

    const menu = await screen.findByRole('button', { name: 'Действия со списком' });

    expect(screen.queryByRole('button', { name: 'Закрыть все' })).not.toBeInTheDocument();

    await user.click(menu);
    await user.click(await screen.findByRole('menuitem', { name: 'Закрыть все…' }));

    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Оборвать все живые соединения?');
    expect(closedAll).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Отмена' }));

    await waitFor(() => {
      expect(menu).toHaveFocus();
    });
    expect(closedAll).not.toHaveBeenCalled();

    await user.click(menu);
    await user.click(await screen.findByRole('menuitem', { name: 'Закрыть все…' }));
    await user.click(await screen.findByRole('button', { name: 'Оборвать' }));

    await waitFor(() => {
      expect(closedAll).toHaveBeenCalledTimes(1);
    });
  });

  it('explains the route with a sheet over the list and clears the selection on Escape', async () => {
    server.use(...createRouteHandlers(CONNECTIONS_FIXTURE.connections));
    const user = userEvent.setup();

    ConnectionStore.getState().apply(makeConnectionsSnapshot(3));
    renderScreen();

    const [explain] = await screen.findAllByRole('button', { name: /Почему соединение/ });

    await user.click(explain);

    expect(await screen.findByRole('dialog', { name: /Маршрут соединения/ })).toBeInTheDocument();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(explain).toHaveAttribute('aria-expanded', 'false');
  });
});
