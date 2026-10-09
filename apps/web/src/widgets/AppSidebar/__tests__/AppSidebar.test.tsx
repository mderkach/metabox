import { renderWithRouter } from '@test/renderWithRouter';
import { server } from '@test/server';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { DAEMON_ENDPOINT } from '@entities/Daemon';
import {
  CLASH_CONFIGS_FIXTURE,
  DAEMON_STATUS_FIXTURE,
  SERVICE_DRIFT_FIXTURE,
  SERVICE_RUNNING_FIXTURE,
} from '@entities/Daemon/__tests__/Daemon.fixture';

import { AppSidebar } from '../ui/AppSidebar';

describe('AppSidebar', () => {
  // Регрессия: react-query держит последнее удачное значение сервиса, и без
  // проверки доступности демона точка осталась бы зелёной поверх баннера
  // «metabox не отвечает».
  it('демон не отвечает — точка сервиса показывает «неизвестно», а не последнее удачное значение', async () => {
    server.use(
      http.get(DAEMON_ENDPOINT.status(), () => new HttpResponse(null, { status: 503 })),
      http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(SERVICE_RUNNING_FIXTURE)),
      http.get(DAEMON_ENDPOINT.clashConfigs(), () => HttpResponse.json(CLASH_CONFIGS_FIXTURE))
    );

    renderWithRouter(AppSidebar);

    expect(await screen.findByText('состояние sing-box неизвестно')).toBeInTheDocument();
    expect(screen.queryByText('sing-box работает')).not.toBeInTheDocument();
  });

  // Подробности расхождения — в разделе конфигурации, а сам факт виден с любого экрана.
  it('расхождение sing-box со схемой форм помечено в подвале', async () => {
    server.use(
      http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json(DAEMON_STATUS_FIXTURE)),
      http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(SERVICE_DRIFT_FIXTURE)),
      http.get(DAEMON_ENDPOINT.clashConfigs(), () => HttpResponse.json(CLASH_CONFIGS_FIXTURE))
    );

    renderWithRouter(AppSidebar);

    expect(await screen.findByText('sing-box старше форм')).toBeInTheDocument();
  });

  it('демон отвечает — точка сервиса показывает состояние службы', async () => {
    server.use(
      http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json(DAEMON_STATUS_FIXTURE)),
      http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(SERVICE_RUNNING_FIXTURE)),
      http.get(DAEMON_ENDPOINT.clashConfigs(), () => HttpResponse.json(CLASH_CONFIGS_FIXTURE))
    );

    renderWithRouter(AppSidebar);

    expect(await screen.findByText('sing-box работает')).toBeInTheDocument();
  });

  it('показывает режим маршрутизации в оболочке, а не только на обзоре', async () => {
    server.use(
      http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json(DAEMON_STATUS_FIXTURE)),
      http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(SERVICE_RUNNING_FIXTURE)),
      http.get(DAEMON_ENDPOINT.clashConfigs(), () => HttpResponse.json(CLASH_CONFIGS_FIXTURE))
    );

    renderWithRouter(AppSidebar);

    expect(await screen.findByRole('combobox', { name: 'Режим маршрутизации: по правилам' })).toBeEnabled();
  });
});
