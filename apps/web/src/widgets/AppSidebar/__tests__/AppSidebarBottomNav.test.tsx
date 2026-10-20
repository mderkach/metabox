import { renderWithRouter } from '@test/renderWithRouter';
import { server } from '@test/server';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { DAEMON_ENDPOINT } from '@entities/Daemon';
import { DAEMON_STATUS_FIXTURE, SERVICE_RUNNING_FIXTURE } from '@entities/Daemon/__tests__/Daemon.fixture';

import { NAV_ITEMS } from '../model';
import { AppSidebarBottomNav } from '../ui/AppSidebarBottomNav';

describe('AppSidebarBottomNav', () => {
  beforeEach(() => {
    server.use(
      http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json(DAEMON_STATUS_FIXTURE)),
      http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(SERVICE_RUNNING_FIXTURE))
    );
  });

  it('leads to menu sections with labeled links, service ones in the "More" sheet', async () => {
    renderWithRouter(AppSidebarBottomNav);

    const nav = await screen.findByRole('navigation', { name: 'Разделы панели' });
    const links = within(nav).getAllByRole('link');

    expect(links.map((link) => link.getAttribute('href'))).toEqual(
      NAV_ITEMS.filter((item) => item.more !== true).map((item) => item.to)
    );
    expect(within(nav).getByRole('link', { name: 'Обзор' })).toBeInTheDocument();
    // The full "Конфигурация" does not fit in a phone column.
    expect(within(nav).getByRole('link', { name: 'Конфиг' })).toHaveAttribute('href', '/config');
    expect(within(nav).getByRole('link', { name: 'Соединения' })).toHaveAttribute('href', '/connections');
    expect(within(nav).getByRole('link', { name: 'Устройства' })).toHaveAttribute('href', '/devices');
  });

  it('marks a stopped sing-box on the "More" item, not only inside its sheet', async () => {
    server.use(
      http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json({ ...SERVICE_RUNNING_FIXTURE, status: 'stopped' }))
    );
    renderWithRouter(AppSidebarBottomNav);

    const nav = await screen.findByRole('navigation', { name: 'Разделы панели' });

    expect(await within(nav).findByRole('button', { name: 'Ещё, sing-box остановлен' })).toBeInTheDocument();
  });

  it('leaves the "More" item unmarked while sing-box runs', async () => {
    renderWithRouter(AppSidebarBottomNav);

    const nav = await screen.findByRole('navigation', { name: 'Разделы панели' });

    await waitFor(() => {
      expect(within(nav).getByRole('button', { name: 'Ещё' })).toBeInTheDocument();
    });
  });

  it('marks one section as current, even when the address is nested in it', async () => {
    renderWithRouter(AppSidebarBottomNav, { path: '/config/rule-set' });

    const nav = await screen.findByRole('navigation', { name: 'Разделы панели' });
    const current = within(nav).getAllByRole('link', { current: 'page' });

    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute('href', '/config');
  });

  // The sixth and seventh columns do not fit at phone width: logs and
  // diagnostics open from "More", and the "More" item is marked while one of them is open.
  it('"More" leads to logs and diagnostics and closes on navigation', async () => {
    const user = userEvent.setup();

    renderWithRouter(AppSidebarBottomNav, { path: '/logs' });

    await user.click(await screen.findByRole('button', { name: 'Ещё' }));

    const sheet = await screen.findByRole('dialog', { name: 'Состояние и настройки' });
    const sections = within(sheet).getByRole('navigation', { name: 'Разделы' });

    expect(within(sections).getByRole('link', { name: 'Логи' })).toHaveAttribute('aria-current', 'page');

    await user.click(within(sections).getByRole('link', { name: 'Диагностика' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Состояние и настройки' })).not.toBeInTheDocument();
    });
  });

  // A phone has no sidebar, and its footer must not vanish along with it.
  it('"More" opens a sheet with the service state, theme and language', async () => {
    const user = userEvent.setup();

    renderWithRouter(AppSidebarBottomNav);

    await user.click(await screen.findByRole('button', { name: 'Ещё' }));

    const sheet = await screen.findByRole('dialog', { name: 'Состояние и настройки' });

    expect(await within(sheet).findByText('sing-box работает')).toBeInTheDocument();
    expect(within(sheet).queryByRole('combobox')).not.toBeInTheDocument();
    expect(within(sheet).getByRole('group', { name: 'Оформление' })).toBeInTheDocument();
    expect(within(sheet).getByRole('group', { name: 'Язык интерфейса' })).toBeInTheDocument();

    await user.click(within(sheet).getByRole('button', { name: 'Закрыть' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Состояние и настройки' })).not.toBeInTheDocument();
    });
  });
});
