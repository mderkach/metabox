import { renderWithRouter } from '@test/renderWithRouter';
import { server } from '@test/server';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { DAEMON_ENDPOINT } from '@entities/Daemon';
import {
  CLASH_CONFIGS_FIXTURE,
  DAEMON_STATUS_FIXTURE,
  SERVICE_RUNNING_FIXTURE,
} from '@entities/Daemon/__tests__/Daemon.fixture';

import { NAV_TARGETS } from '../model';
import { AppSidebarBottomNav } from '../ui/AppSidebarBottomNav';

describe('AppSidebarBottomNav', () => {
  beforeEach(() => {
    server.use(
      http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json(DAEMON_STATUS_FIXTURE)),
      http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(SERVICE_RUNNING_FIXTURE)),
      http.get(DAEMON_ENDPOINT.clashConfigs(), () => HttpResponse.json(CLASH_CONFIGS_FIXTURE))
    );
  });

  it('ведёт на все разделы меню ссылками с подписями', async () => {
    renderWithRouter(AppSidebarBottomNav);

    const nav = await screen.findByRole('navigation', { name: 'Разделы панели' });
    const links = within(nav).getAllByRole('link');

    expect(links.map((link) => link.getAttribute('href'))).toEqual(NAV_TARGETS);
    expect(within(nav).getByRole('link', { name: 'Обзор' })).toBeInTheDocument();
    // Полное «Конфигурация» не помещается в колонку телефона.
    expect(within(nav).getByRole('link', { name: 'Конфиг' })).toHaveAttribute('href', '/config');
  });

  it('помечает текущим один раздел, даже когда адрес вложен в него', async () => {
    renderWithRouter(AppSidebarBottomNav, { path: '/config/rule-set' });

    const nav = await screen.findByRole('navigation', { name: 'Разделы панели' });
    const current = within(nav).getAllByRole('link', { current: 'page' });

    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute('href', '/config');
  });

  // На телефоне боковой панели нет, и её подвал не должен пропасть вместе с ней.
  it('«Ещё» открывает лист с состоянием службы, режимом маршрутизации, темой и языком', async () => {
    const user = userEvent.setup();

    renderWithRouter(AppSidebarBottomNav);

    await user.click(await screen.findByRole('button', { name: 'Ещё' }));

    const sheet = await screen.findByRole('dialog', { name: 'Состояние и настройки' });

    expect(await within(sheet).findByText('sing-box работает')).toBeInTheDocument();
    expect(await within(sheet).findByRole('combobox', { name: 'Режим маршрутизации: по правилам' })).toBeEnabled();
    expect(within(sheet).getByRole('group', { name: 'Оформление' })).toBeInTheDocument();
    expect(within(sheet).getByRole('group', { name: 'Язык интерфейса' })).toBeInTheDocument();

    await user.click(within(sheet).getByRole('button', { name: 'Закрыть' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Состояние и настройки' })).not.toBeInTheDocument();
    });
  });
});
