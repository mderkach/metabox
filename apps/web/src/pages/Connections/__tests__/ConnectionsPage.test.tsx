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
import { ROUTE_DRIFTED_CHAIN_FIXTURE } from '@entities/Route/__tests__/Route.fixture';
import { createRouteHandlers } from '@entities/Route/__tests__/Route.handlers';

import { ConnectionsPage } from '../ui/ConnectionsPage';

/** Тег `direct` у узла типа `selector`: по имени такая строка читалась бы как прямая. */
const PROXY_NAMED_DIRECT = { outbounds: [{ type: 'selector', tag: 'direct', outbounds: ['proxy'] }] };

/** Конфиг с устройства: действие строки красится по типу её аутбаунда, а не по тегу. */
function serveConfig(config: unknown = CONFIG_FIXTURE) {
  server.use(http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(JSON.stringify(config))));
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

  it('фасет по действию отбирает строки', async () => {
    const user = userEvent.setup();

    ConnectionStore.getState().apply(makeConnectionsSnapshot(8));
    renderScreen();

    const kinds = await screen.findByRole('list', { name: 'Действие' });
    const direct = within(kinds).getByRole('button', { name: /напрямую/ });

    await user.click(direct);

    expect(direct).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => {
      expect(screen.getByText('Показано 4 из 8')).toHaveAttribute('role', 'status');
    });
  });

  it('действие строки берёт из типа аутбаунда конфига, а не из его тега', async () => {
    serveConfig(PROXY_NAMED_DIRECT);
    ConnectionStore.getState().apply(makeConnectionsSnapshot(8));
    renderScreen();

    const kinds = await screen.findByRole('list', { name: 'Действие' });

    // Пока конфиг не прочитан, четыре строки `route(direct)` читаются по тегу.
    expect(within(kinds).getByRole('button', { name: /напрямую/ })).toHaveTextContent('4');

    await waitFor(() => {
      expect(within(kinds).queryByRole('button', { name: /напрямую/ })).not.toBeInTheDocument();
    });
    expect(within(kinds).getByRole('button', { name: /через прокси/ })).toHaveTextContent('8');
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

    const kinds = await screen.findByRole('list', { name: 'Действие' });
    const direct = within(kinds).getByRole('button', { name: /напрямую/ });

    expect(direct).toHaveAttribute('aria-pressed', 'true');
  });

  it('записывает срез в адрес, а не в историю переходов', async () => {
    const user = userEvent.setup();

    const { router } = renderScreen();
    ConnectionStore.getState().apply(makeConnectionsSnapshot(4));

    const kinds = await screen.findByRole('list', { name: 'Действие' });

    await user.click(within(kinds).getByRole('button', { name: /напрямую/ }));

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
    expect(screen.getAllByRole('list', { name: 'Устройства', hidden: true })).toHaveLength(1);
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

  it('переключение вкладок сохраняет фильтр колонки активной таблицы', async () => {
    const user = userEvent.setup();

    ConnectionStore.getState().apply(makeConnectionsSnapshot(8));
    renderScreen();

    await user.click(await screen.findByRole('button', { name: 'Фильтр по колонке Куда' }));
    await user.type(await screen.findByRole('textbox', { name: 'Подстрока в колонке Куда' }), 'google');

    await waitFor(() => {
      expect(screen.getByText('Показано 1 из 8')).toHaveAttribute('role', 'status');
    });

    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('tab', { name: /Закрытые/ }));
    await user.click(screen.getByRole('tab', { name: /Активные/ }));

    expect(screen.getByRole('button', { name: 'Фильтр по колонке Куда: активен' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Показано 1 из 8')).toHaveAttribute('role', 'status');
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

  it('прячет срезы под кнопку тулбара и считает выбранные', async () => {
    const user = userEvent.setup();

    ConnectionStore.getState().apply(makeConnectionsSnapshot(8));
    renderScreen();

    const toggle = await screen.findByRole('button', { name: 'Отбор' });

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list', { name: 'Действие' })).not.toBeInTheDocument();

    await user.click(toggle);

    const kinds = await screen.findByRole('list', { name: 'Действие' });

    await user.click(within(kinds).getByRole('button', { name: /напрямую/ }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Отбор: 1 срез' })).toBeInTheDocument();
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
