import { renderWithQuery } from '@test/renderWithQuery';
import { server } from '@test/server';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import type { ConfigDocument } from '@entities/Config';
import { DAEMON_ENDPOINT } from '@entities/Daemon';
import { DAEMON_STATUS_FIXTURE } from '@entities/Daemon/__tests__/Daemon.fixture';

import { ConfigBuildNotice } from '../ui/ConfigBuildNotice';

const CONFIG = {
  outbounds: [{ type: 'direct', tag: 'direct' }],
  services: [{ type: 'ccm' }],
} satisfies ConfigDocument;

describe('ConfigBuildNotice', () => {
  it('names a node that is not in the build, and the consequence', async () => {
    server.use(http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json(DAEMON_STATUS_FIXTURE)));
    renderWithQuery(<ConfigBuildNotice config={CONFIG} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('sing-box на роутере не поддерживает 1 элемент');
    expect(screen.getByText('services[0] — ccm, нужна сборка с with_ccm')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('применить его не получится');
  });

  it('names an option whose tag is not in the build', async () => {
    server.use(http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json(DAEMON_STATUS_FIXTURE)));
    renderWithQuery(<ConfigBuildNotice config={{ experimental: { v2ray_api: {} } }} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('sing-box на роутере не поддерживает 1 элемент конфига');
    expect(screen.getByText('experimental.v2ray_api — нужна сборка с with_v2ray_api')).toBeInTheDocument();
  });

  it('stays silent when the daemon did not read the binary', async () => {
    const { singbox_build: _build, ...status } = DAEMON_STATUS_FIXTURE;
    let answered = false;
    server.use(
      http.get(DAEMON_ENDPOINT.status(), () => {
        answered = true;

        return HttpResponse.json(status);
      })
    );
    renderWithQuery(<ConfigBuildNotice config={CONFIG} />);

    await waitFor(() => {
      expect(answered).toBe(true);
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
