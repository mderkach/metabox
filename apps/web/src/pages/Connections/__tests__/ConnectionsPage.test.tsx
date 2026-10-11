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

/** Тег `direct` у узла типа `selector`: по имени такая строка читалась бы как прямая. */
const PROXY_NAMED_DIRECT = { outbounds: [{ type: 'selector', tag: 'direct', outbounds: ['proxy'] }] };

/** Конфиг с устройства: действие строки красится по типу её аутбаунда, а не по тегу. */
function serveConfig(config: unknown = CONFIG_FIXTURE) {
  server.use(http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(JSON.stringify(config))));
}

/** Открывает фасет и отдаёт его список значений. Сортировка в шапке подписана так же, поэтому ищем в тулбаре. */
async function openFacet(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(within(await screen.findByRole('group', { name: 'Фильтры' })).getByRole('button', { name }));

  return screen.findByRole('listbox');
}

/** Отбор экрана живёт в адресе, поэтому монтируем его на своём маршруте. */
function renderScreen(search = '') {
  return renderWithRouter(ConnectionsPage, {
    path: '/connections',
    validateSearch: parseConnectionSearch,
    initialEntry: `/connections${search}`,
  });
}

describe('экран соединений', () => {
  beforeEach(() => {
    ConnectionStore.getState().reset();
    mockVirtualSizes();
    serveConfig();
  });

  afterEach(() => {
    // Карту типов `reset` не трогает, а следующий тест ждёт разбор по тегу.
    ConnectionStore.getState().setOutboundTypes(new Map());
    vi.restoreAllMocks();
  });

  it('на тысячах соединений держит в DOM окно, а не весь список', async () => {
    ConnectionStore.getState().apply(makeConnectionsSnapshot(5000));
    renderScreen();

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Закрыть соединение/ }).length).toBeGreaterThan(0);
    });

    const rendered = screen.getAllByRole('button', { name: /Закрыть соединение/ });

    expect(rendered.length).toBeLessThan(100);
  });

  it('закрывает соединение по адресу из общей константы', async () => {
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
    // Строка уходит из списка молча: о закрытии говорит живая область экрана.
    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'Результат действия' })).toHaveTextContent('Соединение закрыто');
    });
  });

  it('на паузе новые снапшоты не меняют экран', async () => {
    const user = userEvent.setup();

    renderScreen();
    ConnectionStore.getState().apply(makeConnectionsSnapshot(3));

    await user.click(await screen.findByRole('button', { name: 'Пауза' }));
    ConnectionStore.getState().apply(makeConnectionsSnapshot(40));

    expect(ConnectionStore.getState().active).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeInTheDocument();
  });

  it('шапка называет паузу, а живой поток не подписывает', async () => {
    const user = userEvent.setup();

    renderScreen();

    const header = await screen.findByRole('banner');

    expect(within(header).queryByText('на паузе: строки не обновляются')).not.toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Пауза' }));

    expect(within(header).getByText('на паузе: строки не обновляются')).toBeInTheDocument();
  });

  it('рвёт все соединения только после подтверждения', async () => {
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

  it('фасет по действию отбирает строки и называет выбор на кнопке', async () => {
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

  it('несколько значений одного фасета складывает, а не сужает', async () => {
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

  it('действие строки берёт из типа аутбаунда конфига, а не из его тега', async () => {
    const user = userEvent.setup();

    serveConfig(PROXY_NAMED_DIRECT);
    ConnectionStore.getState().apply(makeConnectionsSnapshot(8));
    renderScreen();

    const kinds = await openFacet(user, /^Действие$/);

    // Четыре строки `route(direct)` по тегу читались бы прямыми.
    await waitFor(() => {
      expect(within(kinds).queryByRole('option', { name: /напрямую/ })).not.toBeInTheDocument();
    });
    expect(within(kinds).getByRole('option', { name: /через прокси/ })).toHaveTextContent('8');
  });

  it('на вкладке закрытых говорит, сколько они хранятся', async () => {
    const user = userEvent.setup();

    renderScreen();
    ConnectionStore.getState().apply(makeConnectionsSnapshot(4));
    ConnectionStore.getState().apply(makeConnectionsSnapshot(1));

    const closedTab = await screen.findByRole('tab', { name: /Закрытые/ });

    // Пояснение стоит над карточкой списка и только на вкладке закрытых.
    expect(screen.queryByText(/хранятся, пока открыта вкладка/)).not.toBeInTheDocument();

    await user.click(closedTab);

    expect(await screen.findByText(/хранятся, пока открыта вкладка/)).toBeInTheDocument();
  });

  it('в подвале закрытых называет вытесненные по лимиту', async () => {
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

  it('пока лимит не достигнут, о вытеснении молчит', async () => {
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

  // Отбор в адресе: ссылкой на отфильтрованный список делятся, когда
  // спрашивают, почему трафик идёт не туда.
  it('поднимает срез из адреса', async () => {
    renderScreen('?kind=direct');
    ConnectionStore.getState().apply(makeConnectionsSnapshot(4));

    expect(await screen.findByRole('button', { name: 'Действие: напрямую' })).toBeInTheDocument();
  });

  // На эту ссылку ведёт экран устройств: «соединения этого устройства».
  it('старая ссылка на одно устройство отбирает его строки', async () => {
    renderScreen('?source=192.168.1.60');
    ConnectionStore.getState().apply(CONNECTIONS_FIXTURE);

    expect(await screen.findByText('api.git.example:443')).toBeInTheDocument();
    expect(screen.queryByText('video.example:443')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Устройство: / })).toBeInTheDocument();
  });

  it('правило без условий выбирается и переживает дорогу через адрес', async () => {
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

  it('выбранное устройство, которого нет в снимке, остаётся в фасете с нулём и снимается руками', async () => {
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

  it('шапка колонки, по полю которой стоит фасет, несёт признак отбора', async () => {
    renderScreen('?kind=direct');
    ConnectionStore.getState().apply(makeConnectionsSnapshot(4));

    expect(await screen.findByRole('columnheader', { name: /Действие/ })).toHaveTextContent('есть отбор');
    expect(screen.getByRole('columnheader', { name: /Куда/ })).not.toHaveTextContent('есть отбор');
  });

  it('пустой экран из-за отбора снимает и поиск, и фасеты', async () => {
    const user = userEvent.setup();

    const { router } = renderScreen('?q=claude&kind=block');
    ConnectionStore.getState().apply(makeConnectionsSnapshot(4));

    await user.click(await screen.findByRole('button', { name: 'Сбросить отбор' }));

    await waitFor(() => {
      expect(router.state.location.search).toEqual({});
    });
    expect(await screen.findByText('4 соединения')).toHaveAttribute('role', 'status');
  });

  it('«Сбросить всё» снимает фасеты и оставляет набранный поиск', async () => {
    const user = userEvent.setup();

    const { router } = renderScreen('?q=example&kind=direct&source=192.168.1.60');
    ConnectionStore.getState().apply(makeConnectionsSnapshot(4));

    await user.click(await screen.findByRole('button', { name: 'Сбросить всё' }));

    await waitFor(() => {
      expect(router.state.location.search).toEqual({ q: 'example' });
    });
    expect(screen.queryByRole('button', { name: 'Сбросить всё' })).not.toBeInTheDocument();
  });

  it('находит соединение по имени устройства, хотя в строке лежит адрес', async () => {
    server.use(...createDeviceHandlers());
    const user = userEvent.setup();

    renderScreen();
    ConnectionStore.getState().apply(CONNECTIONS_FIXTURE);

    const sources = await openFacet(user, /^Устройство$/);

    // Подпись приходит запросом: дождаться её, прежде чем искать по ней.
    await within(sources).findByRole('option', { name: /Ноутбук/ });
    await user.keyboard('{Escape}');
    await user.type(screen.getByRole('textbox', { name: 'Поиск по соединениям' }), 'ноутбук');

    await waitFor(() => {
      expect(screen.queryByText('video.example:443')).not.toBeInTheDocument();
    });
    expect(screen.getByText('api.git.example:443')).toBeInTheDocument();
  });

  it('фасет подписывает устройство именем, а в адрес пишет IP', async () => {
    server.use(...createDeviceHandlers());
    const user = userEvent.setup();

    const { router } = renderScreen();
    ConnectionStore.getState().apply(CONNECTIONS_FIXTURE);

    const sources = await openFacet(user, /^Устройство$/);
    const laptop = await within(sources).findByRole('option', { name: /Ноутбук/ });

    // Адрес стоит рядом с именем: по нему сверяют с журналами роутера.
    expect(laptop).toHaveTextContent('192.168.1.60');

    await user.click(laptop);

    await waitFor(() => {
      expect(router.state.location.search).toEqual({ source: '192.168.1.60' });
    });
  });

  it('записывает срез в адрес, а не в историю переходов', async () => {
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

  it('объясняет маршрут панелью рядом со списком', async () => {
    server.use(...createRouteHandlers(CONNECTIONS_FIXTURE.connections));
    const user = userEvent.setup();

    ConnectionStore.getState().apply(makeConnectionsSnapshot(3));
    renderScreen();

    const [explain] = await screen.findAllByRole('button', { name: /Почему соединение/ });

    await user.click(explain);

    expect(await screen.findByRole('complementary', { name: /Маршрут соединения/ })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('у каждой строки своё объяснение с цепочкой этой строки', async () => {
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

  // Цепочку строки принёс снимок потока, цепочку панели — отдельная ручка
  // позже: они расходятся штатно (ADR-0007), и панель показывает свою, не
  // подменяя её цепочкой строки.
  it('показывает цепочку объяснения, когда она разошлась с цепочкой строки', async () => {
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

  it('поиск и срезы стоят на экране один раз, а не в каждой вкладке', async () => {
    ConnectionStore.getState().apply(makeConnectionsSnapshot(8));
    renderScreen();

    await screen.findAllByRole('button', { name: /Закрыть соединение/ });

    // Скрытая вкладка тоже в DOM, поэтому считаются и скрытые узлы.
    expect(screen.getAllByRole('textbox', { name: 'Поиск по соединениям', hidden: true })).toHaveLength(1);
    expect(screen.getAllByRole('group', { name: 'Фильтры', hidden: true })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Пауза', hidden: true })).toHaveLength(1);
  });

  it('скрытая вкладка стоит на снимке, а число на её ярлыке живое', async () => {
    const user = userEvent.setup();

    renderScreen();

    const closedTab = await screen.findByRole('tab', { name: /Закрытые/ });
    const [, closedPanel] = screen.getAllByRole('tabpanel', { hidden: true });

    act(() => {
      ConnectionStore.getState().apply(makeConnectionsSnapshot(4));
      ConnectionStore.getState().apply(makeConnectionsSnapshot(1));
    });

    expect(closedTab).toHaveTextContent('3');
    // Строки скрытой вкладки не отбираются и не рисуются на каждый снапшот.
    expect(within(closedPanel).getByRole('status', { hidden: true })).toHaveTextContent('0 соединений');

    await user.click(closedTab);

    // Открытая вкладка показывает текущий набор сразу, а не снимок.
    expect(within(closedPanel).getByRole('status')).toHaveTextContent('3 соединения');
  });

  it('переключение вкладок сохраняет фасеты', async () => {
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

describe('экран соединений на телефоне', () => {
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

  it('держит фасеты теми же кнопками, что и на широком экране, без облака значений', async () => {
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

  // На телефоне тулбар переносится, и отдельная кнопка встала бы под поиском,
  // в зоне большого пальца: разрыв уходит в меню списка за подтверждение.
  it('закрывает все соединения только через меню списка и подтверждение', async () => {
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

  it('объясняет маршрут листом поверх списка и снимает выбор по Escape', async () => {
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
