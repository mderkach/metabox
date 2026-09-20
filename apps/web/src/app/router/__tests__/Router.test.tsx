import { RouterProvider } from '@tanstack/react-router';
import { renderWithQuery } from '@test/renderWithQuery';
import { server } from '@test/server';
import { act, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { CONFIG_ENDPOINT, ConfigDocumentState } from '@entities/Config';
import { DAEMON_ENDPOINT } from '@entities/Daemon';
import { DAEMON_STATUS_FIXTURE, SERVICE_RUNNING_FIXTURE } from '@entities/Daemon/__tests__/Daemon.fixture';

import { Router } from '../Router';

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

describe('маршруты панели', () => {
  // Роутер один на модуль и живёт поверх адреса jsdom: без сброса тест получал
  // бы адрес, на котором остановился предыдущий.
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    Router.history.push('/');
  });

  it('открывает конфигурацию с корня: пустого экрана на / нет', async () => {
    serveDaemon();

    renderWithQuery(<RouterProvider router={Router} />);

    // Заголовок экрана повторяет название пункта меню, поэтому опознаём экран
    // по пути к файлу — он есть только на самой странице.
    await waitFor(() => {
      expect(screen.getByText('/etc/sing-box/config.json')).toBeInTheDocument();
    });
    expect(Router.state.location.pathname).toBe('/config');
  });

  // Раздел наборов правил сделан, и пункт меню обязан вести на него: пункт без
  // маршрута выглядит так же, как рабочий, и врёт о состоянии панели.
  it('в навигации сделанные разделы ведут на свои маршруты', async () => {
    serveDaemon();

    renderWithQuery(<RouterProvider router={Router} />);

    await screen.findByRole('navigation', { name: 'Разделы панели' });

    // Пункт проверяется адресом, а не подписью: подпись — предмет правок текста,
    // а обещание меню в том, куда он ведёт.
    const targets = screen.getAllByRole('link').map((link) => link.getAttribute('href'));

    expect(targets).toContain('/config');
    expect(targets).toContain('/config/rule-set');
  });

  // Текстовый режим — вторая ось раздела, а не выход из него: секции отвечают
  // на «какую часть смотрю», режим — на «формами или текстом».
  it('текстовый режим остаётся внутри раздела: вкладки и переключатель на месте', async () => {
    serveDaemon();

    renderWithQuery(<RouterProvider router={Router} />);

    Router.history.push('/config/raw');

    const sections = await screen.findByRole('navigation', { name: 'Секции конфига' });
    const targets = within(sections)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));

    expect(targets).toContain('/config');
    expect(targets).toContain('/config/rule-set');

    const mode = screen.getByRole('navigation', { name: 'Как показан документ' });
    const current = within(mode).getAllByRole('link', { current: 'page' });

    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute('href', '/config/raw');
  });

  // Шапка раздела принадлежит раскладке, а не вкладке: копия на каждой вкладке
  // расходится кеглем и составом правой части.
  it('шапка и история версий существуют в разделе в одном экземпляре', async () => {
    serveDaemon();

    renderWithQuery(<RouterProvider router={Router} />);

    Router.history.push('/config/rule-set');

    await waitFor(() => {
      expect(Router.state.location.pathname).toBe('/config/rule-set');
    });

    expect(screen.getAllByRole('heading', { level: 1, name: 'Конфигурация' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'История версий' })).toHaveLength(1);
  });

  // Вне /config/raw «Формы» помечает текущими только наша разметка: `Link`
  // считает `/config` активной лишь при точном совпадении адреса.
  it('на вкладке сетов текущим режимом остаются «Формы»', async () => {
    serveDaemon();

    renderWithQuery(<RouterProvider router={Router} />);

    Router.history.push('/config/rule-set');

    await waitFor(() => {
      expect(Router.state.location.pathname).toBe('/config/rule-set');
    });

    const mode = screen.getByRole('navigation', { name: 'Как показан документ' });
    const current = within(mode).getAllByRole('link', { current: 'page' });

    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute('href', '/config');
  });

  // Бейдж черновика принадлежит шапке раздела и виден с любой его вкладки.
  it('бейдж черновика показывает шапка раздела, и он один', async () => {
    serveDaemon();

    renderWithQuery(<RouterProvider router={Router} />);

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

    renderWithQuery(<RouterProvider router={Router} />);

    Router.history.push('/nope');

    expect(await screen.findByRole('heading', { name: 'Такой страницы нет' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Разделы панели' })).toBeInTheDocument();
  });

  // Совпадение ссылки по умолчанию префиксное: на вкладке сетов подсвечивались бы
  // и «Конфигурация», и «Каталог сетов» — два текущих раздела одновременно.
  it('в навигации текущим помечен один пункт, даже когда адрес вложен в другой', async () => {
    serveDaemon();

    renderWithQuery(<RouterProvider router={Router} />);

    Router.history.push('/config/rule-set');

    await waitFor(() => {
      expect(Router.state.location.pathname).toBe('/config/rule-set');
    });

    // Вкладки конфигурации — отдельная навигация со своим текущим пунктом.
    const sidebar = screen.getByRole('navigation', { name: 'Разделы панели' });
    const current = within(sidebar).getAllByRole('link', { current: 'page' });

    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute('href', '/config/rule-set');
  });
});
