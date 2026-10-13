import { renderWithRouter } from '@test/renderWithRouter';
import { server } from '@test/server';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { DAEMON_ENDPOINT } from '@entities/Daemon';
import {
  DAEMON_STATUS_FIXTURE,
  SERVICE_DRIFT_FIXTURE,
  SERVICE_RUNNING_FIXTURE,
  SERVICE_UNREAD_FIXTURE,
} from '@entities/Daemon/__tests__/Daemon.fixture';

import { AppSidebar } from '../ui/AppSidebar';

describe('AppSidebar', () => {
  // Regression: react-query keeps the last successful service value, and without
  // the daemon availability check the dot would stay green on top of the
  // "metabox is not responding" banner.
  it('the daemon does not respond: the service dot shows "unknown", not the last successful value', async () => {
    server.use(
      http.get(DAEMON_ENDPOINT.status(), () => new HttpResponse(null, { status: 503 })),
      http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(SERVICE_RUNNING_FIXTURE))
    );

    renderWithRouter(AppSidebar);

    expect(await screen.findByText('состояние sing-box неизвестно')).toBeInTheDocument();
    expect(screen.queryByText('sing-box работает')).not.toBeInTheDocument();
  });

  // Details of the mismatch are in the configuration section, and the fact itself is visible from any screen.
  it('a sing-box mismatch with the form schema is marked in the footer', async () => {
    server.use(
      http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json(DAEMON_STATUS_FIXTURE)),
      http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(SERVICE_DRIFT_FIXTURE))
    );

    renderWithRouter(AppSidebar);

    expect(await screen.findByText('sing-box старше форм')).toBeInTheDocument();
  });

  it('the daemon responds: the service dot shows the service state', async () => {
    server.use(
      http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json(DAEMON_STATUS_FIXTURE)),
      http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(SERVICE_RUNNING_FIXTURE))
    );

    renderWithRouter(AppSidebar);

    expect(await screen.findByText('sing-box работает')).toBeInTheDocument();
  });

  // A daemon that did not read procd serves `stopped` with a reason code: that is not a stop.
  it('an unread service state shows "unknown", not "stopped"', async () => {
    server.use(
      http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json(DAEMON_STATUS_FIXTURE)),
      http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(SERVICE_UNREAD_FIXTURE))
    );

    renderWithRouter(AppSidebar);

    expect(await screen.findByText('состояние sing-box неизвестно')).toBeInTheDocument();
    expect(screen.queryByText('sing-box остановлен')).not.toBeInTheDocument();
  });

  // The Clash API mode is switched on "Overview", the shell does not show it.
  it('there is no Clash API mode in the footer', async () => {
    server.use(
      http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json(DAEMON_STATUS_FIXTURE)),
      http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(SERVICE_RUNNING_FIXTURE))
    );

    renderWithRouter(AppSidebar);

    expect(await screen.findByText('sing-box работает')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
