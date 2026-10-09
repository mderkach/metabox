import { renderWithQuery } from '@test/renderWithQuery';
import { server } from '@test/server';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { DAEMON_ENDPOINT, SCHEMA_VERSION } from '@entities/Daemon';
import { SERVICE_DRIFT_FIXTURE, SERVICE_RUNNING_FIXTURE } from '@entities/Daemon/__tests__/Daemon.fixture';

import { SchemaDriftBanner } from '../SchemaDriftBanner';

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

describe('SchemaDriftBanner', () => {
  it('называет обе версии, когда бинарь разошёлся со схемой форм', async () => {
    serveService(SERVICE_DRIFT_FIXTURE);

    renderWithQuery(<SchemaDriftBanner />);

    const banner = await screen.findByRole('status');

    expect(banner).toHaveTextContent(SCHEMA_VERSION);
    expect(banner).toHaveTextContent(SERVICE_DRIFT_FIXTURE.binary);
  });

  it('на совпадающих версиях молчит', async () => {
    const served = serveService(SERVICE_RUNNING_FIXTURE);

    renderWithQuery(<SchemaDriftBanner />);

    await waitFor(() => {
      expect(served).toHaveBeenCalled();
    });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
