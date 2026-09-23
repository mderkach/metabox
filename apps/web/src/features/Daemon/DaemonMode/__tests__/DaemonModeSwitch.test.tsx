import { renderWithQuery } from '@test/renderWithQuery';
import { selectOption } from '@test/selectOption';
import { server } from '@test/server';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { DAEMON_ENDPOINT } from '@entities/Daemon';
import { CLASH_CONFIGS_FIXTURE } from '@entities/Daemon/__tests__/Daemon.fixture';

import { DaemonModeSwitch } from '../ui/DaemonModeSwitch';

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
  it('показывает текущий режим рантайма', async () => {
    serveClash();
    renderWithQuery(<DaemonModeSwitch />);

    expect(await screen.findByRole('combobox', { name: 'Режим маршрутизации: по правилам' })).toBeEnabled();
  });

  it('переключает режим запросом в рантайм', async () => {
    const patches = serveClash();
    const user = userEvent.setup();
    renderWithQuery(<DaemonModeSwitch />);

    await selectOption(user, await screen.findByRole('combobox', { name: /по правилам/ }), 'глобально');

    expect(await screen.findByRole('combobox', { name: 'Режим маршрутизации: глобально' })).toBeInTheDocument();
    expect(patches).toEqual([{ mode: 'Global' }]);
  });

  it('показывает режим из правил конфига его именем', async () => {
    server.use(
      http.get(DAEMON_ENDPOINT.clashConfigs(), () =>
        HttpResponse.json({ ...CLASH_CONFIGS_FIXTURE, mode: 'Proxy', 'mode-list': ['Rule', 'Proxy'] })
      )
    );
    renderWithQuery(<DaemonModeSwitch />);

    expect(await screen.findByRole('combobox', { name: 'Режим маршрутизации: Proxy' })).toBeInTheDocument();
  });

  it('блокируется, когда режим не прочитан', async () => {
    server.use(
      http.get(DAEMON_ENDPOINT.clashConfigs(), () =>
        HttpResponse.json({ code: 'runtime_unavailable', message: 'рантайм sing-box не отвечает' }, { status: 502 })
      )
    );
    renderWithQuery(<DaemonModeSwitch />);

    expect(
      await screen.findByRole('combobox', { name: 'Режим маршрутизации: sing-box не отвечает — режим не прочитан' })
    ).toBeDisabled();
  });
});
