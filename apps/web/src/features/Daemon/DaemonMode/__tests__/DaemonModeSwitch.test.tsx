import { QueryClientProvider } from '@tanstack/react-query';
import { renderWithQuery } from '@test/renderWithQuery';
import { selectOption } from '@test/selectOption';
import { server } from '@test/server';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DAEMON_ENDPOINT } from '@entities/Daemon';
import { CLASH_CONFIGS_FIXTURE } from '@entities/Daemon/__tests__/Daemon.fixture';
import { QueryClientInstance } from '@shared/api';

import { DaemonModeSwitch } from '../ui/DaemonModeSwitch';

vi.mock('sonner', () => ({
  toast: { error: vi.fn<(text: string) => void>(), success: vi.fn<(text: string) => void>() },
}));

const { toast } = await import('sonner');

/** Рантайм, который принимает только режимы из своего списка, как sing-box. */
function serveClash() {
  let configs = CLASH_CONFIGS_FIXTURE;
  const patches: unknown[] = [];

  server.use(
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

describe('DaemonModeSwitch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    QueryClientInstance.clear();
  });

  it('показывает текущий режим рантайма', async () => {
    serveClash();
    renderWithQuery(<DaemonModeSwitch />);

    expect(await screen.findByRole('combobox', { name: 'Режим Clash API: по правилам' })).toBeEnabled();
  });

  it('переключает режим запросом в рантайм', async () => {
    const patches = serveClash();
    const user = userEvent.setup();
    renderWithQuery(<DaemonModeSwitch />);

    await selectOption(user, await screen.findByRole('combobox', { name: /по правилам/ }), 'глобально');

    expect(await screen.findByRole('combobox', { name: 'Режим Clash API: глобально' })).toBeInTheDocument();
    expect(patches).toEqual([{ mode: 'Global' }]);
  });

  it('показывает режим из правил конфига его именем', async () => {
    server.use(
      http.get(DAEMON_ENDPOINT.clashConfigs(), () =>
        HttpResponse.json({ ...CLASH_CONFIGS_FIXTURE, mode: 'Proxy', 'mode-list': ['Rule', 'Proxy'] })
      )
    );
    renderWithQuery(<DaemonModeSwitch />);

    expect(await screen.findByRole('combobox', { name: 'Режим Clash API: Proxy' })).toBeInTheDocument();
  });

  it('вместо выбора называет причину, когда режим не прочитан', async () => {
    server.use(
      http.get(DAEMON_ENDPOINT.clashConfigs(), () =>
        HttpResponse.json({ code: 'runtime_unavailable', message: 'рантайм sing-box не отвечает' }, { status: 502 })
      )
    );
    renderWithQuery(<DaemonModeSwitch />);

    expect(await screen.findByText('режим не прочитан: sing-box не отвечает')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('пока режим читается, показывает скелетон, а не пустой выбор', () => {
    server.use(http.get(DAEMON_ENDPOINT.clashConfigs(), async () => delay('infinite')));
    renderWithQuery(<DaemonModeSwitch />);

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByText(/режим не прочитан/)).not.toBeInTheDocument();
  });

  it('отказ смены возвращает прежний режим и показывает тост', async () => {
    server.use(
      http.get(DAEMON_ENDPOINT.clashConfigs(), () => HttpResponse.json(CLASH_CONFIGS_FIXTURE)),
      http.patch(DAEMON_ENDPOINT.clashConfigs(), () =>
        HttpResponse.json({ code: 'runtime_unavailable', message: 'рантайм sing-box не отвечает' }, { status: 502 })
      )
    );
    const user = userEvent.setup();
    // Тосты показывает кэш мутаций клиента приложения, у тестового клиента его нет.
    render(
      <QueryClientProvider client={QueryClientInstance}>
        <DaemonModeSwitch />
      </QueryClientProvider>
    );

    await selectOption(user, await screen.findByRole('combobox', { name: /по правилам/ }), 'глобально');

    expect(await screen.findByRole('combobox', { name: 'Режим Clash API: по правилам' })).toBeInTheDocument();
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledOnce();
    });
  });
});
