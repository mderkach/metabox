import { renderWithRouter } from '@test/renderWithRouter';
import { server } from '@test/server';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18next from 'i18next';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configHandlers } from '@entities/Config/__tests__/Config.handlers';
import { ConnectionStore } from '@entities/Connection';
import { CONNECTIONS_FIXTURE } from '@entities/Connection/__tests__/Connection.fixture';
import { DAEMON_ENDPOINT } from '@entities/Daemon';
import { SERVICE_RUNNING_FIXTURE } from '@entities/Daemon/__tests__/Daemon.fixture';
import { createDeviceHandlers } from '@entities/Device/__tests__/Device.handlers';
import { createStatefulProxyHandlers } from '@entities/Proxy/__tests__/Proxy.handlers';
import { ROUTE_ENDPOINT } from '@entities/Route';
import { createRouteHandlers } from '@entities/Route/__tests__/Route.handlers';
import { NARROW_SCREEN } from '@shared/lib/media';

import { HowItWorksPage } from '../ui/HowItWorksPage';

const LIVE_TITLE = 'Открытые соединения';

class SilentEventSource {
  addEventListener(): void {}
  removeEventListener(): void {}
  close(): void {}
}

describe('How metabox works', () => {
  beforeEach(() => {
    vi.stubGlobal('EventSource', SilentEventSource);
    ConnectionStore.getState().reset();
    server.use(
      http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(SERVICE_RUNNING_FIXTURE)),
      ...configHandlers,
      ...createDeviceHandlers(),
      ...createStatefulProxyHandlers(),
      ...createRouteHandlers(CONNECTIONS_FIXTURE.connections)
    );
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await i18next.changeLanguage('ru');
  });

  it('keeps the terms but shows no invented connection', async () => {
    ConnectionStore.getState().apply({ ...CONNECTIONS_FIXTURE, connections: [] });
    renderWithRouter(HowItWorksPage);

    expect(await screen.findByText('Сейчас нет соединений.')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: LIVE_TITLE })).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Термины' })).toBeInTheDocument();
  });

  it('points to Overview when the core is stopped', async () => {
    server.use(
      http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json({ ...SERVICE_RUNNING_FIXTURE, status: 'stopped' }))
    );
    renderWithRouter(HowItWorksPage);

    expect(await screen.findByRole('link', { name: 'Открыть Обзор' })).toHaveAttribute('href', '/overview');
    expect(screen.queryByRole('group', { name: LIVE_TITLE })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Термины' })).toBeInTheDocument();
  });

  it('follows a live group then a direct connection without reshuffling on new frames', async () => {
    const user = userEvent.setup();
    ConnectionStore.getState().apply(CONNECTIONS_FIXTURE);
    renderWithRouter(HowItWorksPage);

    const choices = await screen.findByRole('group', { name: LIVE_TITLE });
    const first = await within(choices).findByRole('button', { pressed: true });
    expect(first).toHaveAccessibleName(/Через группу/);
    expect(await screen.findByText(/Выбран us/)).toBeInTheDocument();

    await user.click(within(choices).getByRole('button', { name: /Напрямую/ }));
    expect(await screen.findByText('Без прокси-сервера')).toBeInTheDocument();
    const direct = within(choices).getByRole('button', { pressed: true });

    act(() => {
      ConnectionStore.getState().apply({
        ...CONNECTIONS_FIXTURE,
        connections: CONNECTIONS_FIXTURE.connections.toReversed(),
      });
    });

    expect(direct).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the last explanation after the connection closes', async () => {
    ConnectionStore.getState().apply(CONNECTIONS_FIXTURE);
    renderWithRouter(HowItWorksPage);
    expect(await screen.findByText(/Выбран us/)).toBeInTheDocument();

    act(() => {
      ConnectionStore.getState().apply({ ...CONNECTIONS_FIXTURE, connections: [] });
    });

    expect(await screen.findByText('Это соединение закрыто.')).toBeInTheDocument();
    expect(screen.getByText(/Выбран us/)).toBeInTheDocument();
  });

  it('replaces a connection that closes before the explanation arrives', async () => {
    const first = CONNECTIONS_FIXTURE.connections.at(0);
    if (first === undefined) throw new Error('No initial connection in fixture');
    server.use(
      http.get(ROUTE_ENDPOINT.explanation(first.id), () =>
        HttpResponse.json({ code: 'connection_missing', message: 'no connection with this ID' }, { status: 404 })
      )
    );
    ConnectionStore.getState().apply(CONNECTIONS_FIXTURE);
    renderWithRouter(HowItWorksPage);

    const choices = await screen.findByRole('group', { name: LIVE_TITLE });
    expect(await within(choices).findByRole('button', { pressed: true, name: /api.git.example/ })).toBeInTheDocument();
    expect(within(choices).queryByText(/video.example/)).not.toBeInTheDocument();
  });

  it('keeps an unverified rule link at the list', async () => {
    const user = userEvent.setup();
    ConnectionStore.getState().apply(CONNECTIONS_FIXTURE);
    renderWithRouter(HowItWorksPage);

    await screen.findByText(/Не удалось сопоставить правило/);
    const walk = screen.getByRole('list', { name: 'Путь соединения' });
    await user.click(within(walk).getByRole('button', { name: /^Правило/ }));
    expect(screen.getByRole('link', { name: 'Где настроить' })).toHaveAttribute('href', '/config');
  });

  it('shows the request failure with a retry and keeps the glossary available', async () => {
    const user = userEvent.setup();
    const first = CONNECTIONS_FIXTURE.connections.at(0);
    if (first === undefined) throw new Error('No initial connection in fixture');
    server.use(
      http.get(ROUTE_ENDPOINT.explanation(first.id), () =>
        HttpResponse.json({ message: 'mock failure' }, { status: 503 })
      )
    );
    ConnectionStore.getState().apply(CONNECTIONS_FIXTURE);
    renderWithRouter(HowItWorksPage);

    expect(await screen.findByText('mock failure')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Термины' })).toBeInTheDocument();
    server.use(...createRouteHandlers(CONNECTIONS_FIXTURE.connections));
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByText(/Выбран us/)).toBeInTheDocument();
  });

  it.each([
    [
      'en',
      'Open Overview',
      'Where it is configured',
      ['Device', 'Service', 'Rule', 'Outbound', 'Group', 'Server', 'Subscription', 'Core'],
    ],
    [
      'ru',
      'Открыть Обзор',
      'Где настроить',
      ['Устройство', 'Сервис', 'Правило', 'Выход', 'Группа', 'Сервер', 'Подписка', 'Ядро'],
    ],
  ] as const)('defines and links all eight terms in %s', async (language, overview, configure, names) => {
    await i18next.changeLanguage(language);
    const user = userEvent.setup();
    server.use(
      http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json({ ...SERVICE_RUNNING_FIXTURE, status: 'stopped' }))
    );
    renderWithRouter(HowItWorksPage);
    await screen.findByRole('link', { name: overview });

    const destinations = [
      '/devices',
      '/config/rule-set',
      '/config',
      '/config/outbounds',
      '/proxies',
      '/config/outbounds',
      '/config/providers',
      '/settings',
    ];
    for (const [index, name] of names.entries()) {
      const card = screen.getByRole('button', { name });
      await user.click(card);
      expect(card).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('link', { name: configure })).toHaveAttribute('href', destinations[index]);
    }
  });

  it('opens a term directly below the selected step on a phone', async () => {
    vi.stubGlobal('matchMedia', (media: string) => ({
      matches: media === NARROW_SCREEN,
      media,
      addEventListener: vi.fn<() => void>(),
      removeEventListener: vi.fn<() => void>(),
    }));
    const user = userEvent.setup();
    ConnectionStore.getState().apply({ ...CONNECTIONS_FIXTURE, connections: [] });
    renderWithRouter(HowItWorksPage);

    const north = await screen.findByRole('button', { name: /^Куда соединение/ });
    await user.click(north);
    const walk = screen.getByRole('list', { name: 'Путь соединения' });
    expect(within(walk).getByRole('heading', { name: 'Сервис' })).toBeInTheDocument();
    expect(within(walk).getByRole('link', { name: 'Где настроить' })).toHaveAttribute('href', '/config/rule-set');
    expect(north).toHaveFocus();
  });
});
