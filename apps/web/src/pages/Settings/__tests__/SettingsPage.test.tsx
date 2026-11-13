import { renderWithRouter } from '@test/renderWithRouter';
import { server } from '@test/server';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { createAuthHandlers } from '@entities/Auth/__tests__/Auth.handlers';
import { DAEMON_ENDPOINT } from '@entities/Daemon';
import { DAEMON_STATUS_FIXTURE, SERVICE_RUNNING_FIXTURE } from '@entities/Daemon/__tests__/Daemon.fixture';
import { createMcpHandlers } from '@entities/Mcp/__tests__/Mcp.handlers';

import { SettingsPage } from '../ui/SettingsPage';

describe('settings screen', () => {
  // Each section is complete on its own, without a dialog or a wizard.
  it('shows access, agents and system as sections of one screen', async () => {
    server.use(
      ...createAuthHandlers(),
      ...createMcpHandlers(),
      http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json(DAEMON_STATUS_FIXTURE)),
      http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(SERVICE_RUNNING_FIXTURE))
    );

    renderWithRouter(SettingsPage);

    expect(await screen.findByRole('heading', { level: 2, name: 'Доступ' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Агенты' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Система' })).toBeInTheDocument();
    expect(await screen.findByLabelText('Новый пароль')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Включить' })).toBeInTheDocument();
    expect(await screen.findByText('работает')).toBeInTheDocument();
  });
});
