import { renderWithQuery } from '@test/renderWithQuery';
import { server } from '@test/server';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { DAEMON_ENDPOINT, SCHEMA_VERSION } from '@entities/Daemon';
import { SERVICE_DRIFT_FIXTURE, SERVICE_RUNNING_FIXTURE } from '@entities/Daemon/__tests__/Daemon.fixture';

import { SchemaDriftNotice } from '../SchemaDriftNotice';

function serveService(state: typeof SERVICE_RUNNING_FIXTURE) {
  const served = vi.fn<() => void>();

  server.use(
    http.get(DAEMON_ENDPOINT.service(), () => {
      served();
      return HttpResponse.json(state);
    })
  );

  return served;
}

describe('SchemaDriftNotice', () => {
  it('бинарь старше схемы: предупреждает, что поле из формы не пройдёт проверку', async () => {
    serveService(SERVICE_DRIFT_FIXTURE);

    renderWithQuery(<SchemaDriftNotice />);

    const notice = await screen.findByText(/не пройдёт проверку при применении/);

    expect(notice).toHaveTextContent(SCHEMA_VERSION);
    expect(notice).toHaveTextContent(SERVICE_DRIFT_FIXTURE.binary);
  });

  it('бинарь новее схемы: отправляет новые поля в текстовый режим', async () => {
    serveService({ ...SERVICE_RUNNING_FIXTURE, binary: '99.0.0-extended-0.0.1' });

    renderWithQuery(<SchemaDriftNotice />);

    expect(await screen.findByText(/их правят в режиме «Текст»/)).toHaveTextContent('99.0.0-extended-0.0.1');
  });

  it('на совпадающих версиях молчит', async () => {
    const served = serveService(SERVICE_RUNNING_FIXTURE);

    renderWithQuery(<SchemaDriftNotice />);

    await waitFor(() => {
      expect(served).toHaveBeenCalled();
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
