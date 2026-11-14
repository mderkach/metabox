import { renderWithQuery } from '@test/renderWithQuery';
import { server } from '@test/server';
import { screen } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DAEMON_ENDPOINT } from '@entities/Daemon';
import { CLASH_CONFIGS_FIXTURE } from '@entities/Daemon/__tests__/Daemon.fixture';
import { QueryClientInstance } from '@shared/api';

import { DaemonModeSwitch } from '../ui/DaemonModeSwitch';

describe('DaemonModeSwitch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    QueryClientInstance.clear();
  });

  it('shows the current runtime mode', async () => {
    server.use(http.get(DAEMON_ENDPOINT.clashConfigs(), () => HttpResponse.json(CLASH_CONFIGS_FIXTURE)));
    renderWithQuery(<DaemonModeSwitch />);

    expect(await screen.findByRole('combobox', { name: 'Режим Clash API: по правилам' })).toBeEnabled();
  });

  it('shows the mode from the config rules by its name', async () => {
    server.use(
      http.get(DAEMON_ENDPOINT.clashConfigs(), () =>
        HttpResponse.json({ ...CLASH_CONFIGS_FIXTURE, mode: 'Proxy', 'mode-list': ['Rule', 'Proxy'] })
      )
    );
    renderWithQuery(<DaemonModeSwitch />);

    expect(await screen.findByRole('combobox', { name: 'Режим Clash API: Proxy' })).toBeInTheDocument();
  });

  it('instead of a choice names the reason when the mode is not read', async () => {
    server.use(
      http.get(DAEMON_ENDPOINT.clashConfigs(), () =>
        HttpResponse.json({ code: 'runtime_unavailable', message: 'sing-box runtime unavailable' }, { status: 502 })
      )
    );
    renderWithQuery(<DaemonModeSwitch />);

    expect(await screen.findByText('режим не прочитан: sing-box не отвечает')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('while the mode is being read shows a skeleton, not an empty choice', () => {
    server.use(http.get(DAEMON_ENDPOINT.clashConfigs(), async () => delay('infinite')));
    renderWithQuery(<DaemonModeSwitch />);

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByText(/режим не прочитан/)).not.toBeInTheDocument();
  });
});
