import { QueryClientProvider } from '@tanstack/react-query';
import { worker } from '@test/browserWorker';
import { renderWithQuery } from '@test/renderWithQuery';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';

import { DAEMON_ENDPOINT } from '@entities/Daemon';
import { CLASH_CONFIGS_FIXTURE } from '@entities/Daemon/__tests__/Daemon.fixture';
import { QueryClientInstance } from '@shared/api';

import { DaemonModeSwitch } from '../ui/DaemonModeSwitch';

vi.mock('sonner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('sonner')>();

  return { ...actual, toast: { error: vi.fn<(text: string) => void>(), success: vi.fn<(text: string) => void>() } };
});

const { toast } = await import('sonner');

/** A runtime that accepts only modes from its own list, like sing-box. */
function serveClash() {
  let configs = CLASH_CONFIGS_FIXTURE;
  const patches: unknown[] = [];

  worker.use(
    http.get(DAEMON_ENDPOINT.clashConfigs(), () => HttpResponse.json(configs)),
    http.patch(DAEMON_ENDPOINT.clashConfigs(), async ({ request }) => {
      const body: unknown = await request.json();
      patches.push(body);

      const mode = typeof body === 'object' && body !== null && 'mode' in body ? String(body.mode) : '';

      if (configs['mode-list'].includes(mode)) {
        configs = { ...configs, mode };
      }

      return new HttpResponse(null, { status: 204 });
    })
  );

  return patches;
}

describe('DaemonModeSwitch picked with the mouse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    QueryClientInstance.clear();
  });

  it('switches the mode with a runtime request', async () => {
    const patches = serveClash();
    renderWithQuery(<DaemonModeSwitch />);

    await userEvent.click(await screen.findByRole('combobox', { name: /по правилам/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'глобально' }));

    expect(await screen.findByRole('combobox', { name: 'Режим Clash API: глобально' })).toBeInTheDocument();
    await waitFor(() => {
      expect(patches).toEqual([{ mode: 'Global' }]);
    });
  });

  it('a failed switch returns the previous mode and shows a toast', async () => {
    worker.use(
      http.get(DAEMON_ENDPOINT.clashConfigs(), () => HttpResponse.json(CLASH_CONFIGS_FIXTURE)),
      http.patch(DAEMON_ENDPOINT.clashConfigs(), () =>
        HttpResponse.json({ code: 'runtime_unavailable', message: 'sing-box runtime unavailable' }, { status: 502 })
      )
    );
    // Toasts are shown by the app client mutation cache, the test client has none.
    render(
      <QueryClientProvider client={QueryClientInstance}>
        <DaemonModeSwitch />
      </QueryClientProvider>
    );

    await userEvent.click(await screen.findByRole('combobox', { name: /по правилам/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'глобально' }));

    expect(await screen.findByRole('combobox', { name: 'Режим Clash API: по правилам' })).toBeInTheDocument();
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledOnce();
    });
  });
});
