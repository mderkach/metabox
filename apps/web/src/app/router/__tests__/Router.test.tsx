import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { renderWithQuery } from '@test/renderWithQuery';
import { server } from '@test/server';
import { act, screen, waitFor, within } from '@testing-library/react';
import i18next from 'i18next';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CONFIG_ENDPOINT, CONFIG_SECTION, ConfigDocumentState } from '@entities/Config';
import { DAEMON_ENDPOINT } from '@entities/Daemon';
import {
  CLASH_CONFIGS_FIXTURE,
  DAEMON_STATUS_FIXTURE,
  SERVICE_RUNNING_FIXTURE,
  TRAFFIC_HISTORY_FIXTURE,
} from '@entities/Daemon/__tests__/Daemon.fixture';
import { PROXY_ENDPOINT } from '@entities/Proxy';
import { NARROW_SCREEN } from '@shared/lib/media';

import { createPanelRouter } from '../Router';

function serveDaemon() {
  server.use(
    http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json(DAEMON_STATUS_FIXTURE)),
    http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(SERVICE_RUNNING_FIXTURE)),
    http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(MINIMAL_CONFIG)),
    http.get(CONFIG_ENDPOINT.versions(), () => HttpResponse.json({ versions: [] }))
  );
}

/** Экрану достаточно разбираемого конфига: список правил здесь не проверяется. */
const MINIMAL_CONFIG = JSON.stringify({ route: { rules: [{ outbound: 'direct' }] } }, null, 2);

/** `matchMedia` в jsdom нет — подставляем ответ только на запрос узкой ширины. */
function mockNarrowScreen() {
  vi.stubGlobal('matchMedia', function matchNarrowQuery(media: string) {
    return {
      matches: media === NARROW_SCREEN,
      media,
      addEventListener: vi.fn<() => void>(),
      removeEventListener: vi.fn<() => void>(),
    };
  });
}

/**
 * Обзор читает поток рантайма, и оболочка открывает `EventSource`, которого в
 * jsdom нет: без заглушки маршрут падал бы в экран ошибки. Кадры здесь не
 * нужны — тест проверяет, какой экран открылся.
 */
class SilentEventSource {
  addEventListener(): void {
    // Кадров не будет: слушать нечего.
  }

  removeEventListener(): void {
    // Подписок нет: снимать нечего.
  }

  close(): void {
    // Соединения нет: закрывать нечего.
  }
}

/** Свой роутер на тест: открывается сразу на нужном адресе и не делит его с соседями. */
function renderRouter(path = '/') {
  const router = createPanelRouter(createMemoryHistory({ initialEntries: [path] }));

  renderWithQuery(<RouterProvider router={router} />);

  return router;
}

describe('маршруты панели', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('открывает конфигурацию с корня: пустого экрана на / нет', async () => {
    serveDaemon();

    const router = renderRouter();

    // Заголовок экрана повторяет название пункта меню, поэтому опознаём экран
    // по пути к файлу — он есть только на самой странице.
    await waitFor(() => {
      expect(screen.getByText('/etc/sing-box/config.json')).toBeInTheDocument();
    });
    expect(router.state.location.pathname).toBe('/config');
  });

  // С телефона на роутер заходят проверить, что всё работает, а не править конфиг.
  it('на телефоне открывает с корня обзор', async () => {
    serveDaemon();
    server.use(
      http.get(DAEMON_ENDPOINT.clashConfigs(), () => HttpResponse.json(CLASH_CONFIGS_FIXTURE)),
      http.get(PROXY_ENDPOINT.proxies(), () => HttpResponse.json({ proxies: {} })),
      http.get(DAEMON_ENDPOINT.history(), () => HttpResponse.json(TRAFFIC_HISTORY_FIXTURE))
    );
    mockNarrowScreen();
    vi.stubGlobal('EventSource', SilentEventSource);

    const router = renderRouter();

    expect(await screen.findByRole('heading', { level: 1, name: 'Обзор' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/overview');

    const nav = screen.getByRole('navigation', { name: 'Разделы панели' });

    expect(within(nav).getByRole('link', { current: 'page' })).toHaveAttribute('href', '/overview');
  });

  // Раздел наборов правил сделан, и пункт меню обязан вести на него: пункт без
  // маршрута выглядит так же, как рабочий, и врёт о состоянии панели.
  it('в навигации сделанные разделы ведут на свои маршруты', async () => {
    serveDaemon();

    renderRouter();

    await screen.findByRole('navigation', { name: 'Разделы панели' });

    // Пункт проверяется адресом, а не подписью: подпись — предмет правок текста,
    // а обещание меню в том, куда он ведёт.
    const targets = [...screen.getAllByRole('link'), ...screen.getAllByRole('tab')].map((link) =>
      link.getAttribute('href')
    );

    expect(targets).toContain('/config');
    expect(targets).toContain('/config/rule-set');
  });

  // Секции без экрана не занимают полосу вкладками, но и не пропадают: их
  // список вместе с размером секции — по кнопке рядом с полосой.
  it('каждая секция — вкладка, а без своих форм она открывается экраном узлов', async () => {
    serveDaemon();

    renderRouter('/config/log');

    const sections = await screen.findByRole('tablist', { name: 'Секции конфига' });

    expect(within(sections).getAllByRole('tab')).toHaveLength(Object.values(CONFIG_SECTION).length);

    // Секции в файле нет — редактор предлагает пустой узел, сохранение создаст её.
    expect(await screen.findByRole('textbox', { name: 'Узел log текстом' })).toHaveValue('{}');
  });

  // Текстовый режим — вторая ось раздела, а не выход из него: секции отвечают
  // на «какую часть смотрю», режим — на «формами или текстом».
  it('текстовый режим остаётся внутри раздела: вкладки и переключатель на месте', async () => {
    serveDaemon();

    renderRouter('/config/raw');

    const sections = await screen.findByRole('tablist', { name: 'Секции конфига' });
    const targets = within(sections)
      .getAllByRole('tab')
      .map((tab) => tab.getAttribute('href'));

    expect(targets).toContain('/config');
    expect(targets).toContain('/config/rule-set');

    const mode = screen.getByRole('tablist', { name: 'Как показан документ' });
    const current = within(mode).getAllByRole('tab', { current: 'page' });

    expect(within(mode).getByRole('tab', { selected: true })).toHaveAttribute('href', '/config/raw');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute('href', '/config/raw');
  });

  // Шапка раздела принадлежит раскладке, а не вкладке: копия на каждой вкладке
  // расходится кеглем и составом правой части.
  it('шапка и история версий существуют в разделе в одном экземпляре', async () => {
    serveDaemon();

    renderRouter('/config/rule-set');

    expect(await screen.findAllByRole('heading', { level: 1, name: 'Конфигурация' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'История версий' })).toHaveLength(1);
  });

  // Вне /config/raw «Формы» выбирает полоса по адресу раздела, а текущей
  // страницей `Link` её не помечает: `/config` активна лишь при точном совпадении.
  it('на вкладке сетов текущим режимом остаются «Формы»', async () => {
    serveDaemon();

    renderRouter('/config/rule-set');

    const mode = await screen.findByRole('tablist', { name: 'Как показан документ' });

    expect(within(mode).getByRole('tab', { selected: true })).toHaveAttribute('href', '/config');
    expect(within(mode).queryAllByRole('tab', { current: 'page' })).toHaveLength(0);
  });

  // Словарь, не догруженный лоадером, уводит часть экрана в `Suspense`: форма
  // «Свой набор» открывается через заглушку вместо текста. В тесте словари лежат
  // в памяти, поэтому проверяется то, что лоадер о них просит.
  it('лоадер сетов догружает словари каждого слайса, который показывает экран', async () => {
    serveDaemon();
    const loadNamespaces = vi.spyOn(i18next, 'loadNamespaces');

    renderRouter('/config/rule-set');

    await screen.findAllByRole('heading', { level: 1, name: 'Конфигурация' });

    const requested = loadNamespaces.mock.calls.flatMap(([namespaces]) => [namespaces].flat());

    expect(requested).toEqual(
      expect.arrayContaining([
        'pages/RuleSets',
        'widgets/RuleSet/RuleSetTable',
        'features/RuleSet/RuleSetAdd',
        'features/RuleSet/RuleSetCustom',
        'features/Config/ConfigCacheFile',
      ])
    );
  });

  // Бейдж черновика принадлежит шапке раздела и виден с любой его вкладки.
  it('бейдж черновика показывает шапка раздела, и он один', async () => {
    serveDaemon();

    renderRouter();

    await waitFor(() => {
      expect(screen.getByText('/etc/sing-box/config.json')).toBeInTheDocument();
    });

    expect(screen.queryByText('черновик')).not.toBeInTheDocument();

    act(() => {
      ConfigDocumentState.getState().replace(`${MINIMAL_CONFIG}\n`);
    });

    expect(screen.getAllByText('черновик')).toHaveLength(1);
  });

  // Неизвестный путь не должен ронять оболочку: без своей заглушки TanStack
  // Router отдаёт голое «Not Found» без сайдбара и без перевода.
  it('на неизвестном пути показывает переведённую заглушку вместе с навигацией панели', async () => {
    serveDaemon();

    renderRouter('/nope');

    expect(await screen.findByRole('heading', { name: 'Такой страницы нет' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Разделы панели' })).toBeInTheDocument();
  });

  // Вкладки раздела живут на своих адресах, и точное совпадение ссылки гасило
  // бы «Конфигурацию» на всех, кроме первой.
  it('в навигации текущим помечен один пункт, даже когда адрес вложен в другой', async () => {
    serveDaemon();

    renderRouter('/config/rule-set');

    // Вкладки конфигурации — отдельная навигация со своим текущим пунктом.
    const sidebar = await screen.findByRole('navigation', { name: 'Разделы панели' });
    const current = within(sidebar).getAllByRole('link', { current: 'page' });

    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute('href', '/config');
  });
});
