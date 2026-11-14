import { worker } from '@test/browserWorker';
import { renderWithRouter } from '@test/renderWithRouter';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { CONFIG_ENDPOINT } from '@entities/Config';
import { ConnectionStore } from '@entities/Connection';
import { DAEMON_ENDPOINT, RuntimeStore, SCHEMA_VERSION } from '@entities/Daemon';
import {
  CLASH_CONFIGS_FIXTURE,
  DAEMON_STATUS_FIXTURE,
  SERVICE_RUNNING_FIXTURE,
  TRAFFIC_HISTORY_FIXTURE,
} from '@entities/Daemon/__tests__/Daemon.fixture';
import { createDeviceHandlers } from '@entities/Device/__tests__/Device.handlers';
import { PROXY_ENDPOINT } from '@entities/Proxy';
import { proxyHandlers } from '@entities/Proxy/__tests__/Proxy.handlers';

import { OverviewPage } from '../ui/OverviewPage';

const MINIMAL_CONFIG = JSON.stringify({ outbounds: [{ type: 'direct', tag: 'direct' }] }, null, 2);

function serveStatus() {
  worker.use(
    http.get(DAEMON_ENDPOINT.status(), () =>
      HttpResponse.json({
        ...DAEMON_STATUS_FIXTURE,
        core: { ...DAEMON_STATUS_FIXTURE.core, version: SCHEMA_VERSION },
      })
    ),
    http.get(DAEMON_ENDPOINT.clashConfigs(), () => HttpResponse.json(CLASH_CONFIGS_FIXTURE)),
    http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(SERVICE_RUNNING_FIXTURE)),
    http.get(PROXY_ENDPOINT.proxies(), () => HttpResponse.json({ proxies: {} })),
    http.get(DAEMON_ENDPOINT.history(), () => HttpResponse.json(TRAFFIC_HISTORY_FIXTURE)),
    http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(MINIMAL_CONFIG)),
    ...createDeviceHandlers()
  );
}

describe('overview screen picked with the mouse', () => {
  beforeEach(() => {
    ConnectionStore.getState().reset();
    RuntimeStore.getState().reset();
    serveStatus();
  });

  it('switches the node of a selector group from the status strip and announces it', async () => {
    worker.use(...proxyHandlers);

    renderWithRouter(OverviewPage);

    const region = await screen.findByRole('status', { name: 'Результат действия' });

    await userEvent.click(await screen.findByRole('combobox', { name: 'Узел группы us-fallback' }));
    await userEvent.click(await screen.findByRole('option', { name: 'proxy' }));

    await waitFor(() => {
      expect(region).toHaveTextContent('us-fallback: выбран узел proxy');
    });
  });

  it('switches the Clash API mode with a runtime request', async () => {
    // On a narrow screen the process section is collapsed, and the mode switch is inside it.
    await page.viewport(1280, 900);
    const patches: unknown[] = [];
    worker.use(
      http.patch(DAEMON_ENDPOINT.clashConfigs(), async ({ request }) => {
        patches.push(await request.json());

        return new HttpResponse(null, { status: 204 });
      })
    );

    renderWithRouter(OverviewPage);

    await userEvent.click(await screen.findByRole('combobox', { name: 'Режим Clash API: по правилам' }));
    await userEvent.click(await screen.findByRole('option', { name: 'напрямую' }));

    await waitFor(() => {
      expect(patches).toEqual([{ mode: 'Direct' }]);
    });
  });
});
