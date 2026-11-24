import { renderWithQuery } from '@test/renderWithQuery';
import { server } from '@test/server';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, expect, it } from 'vitest';

import { ConfigDocumentStore } from '@entities/Config';
import { DAEMON_ENDPOINT } from '@entities/Daemon';
import { DAEMON_STATUS_FIXTURE } from '@entities/Daemon/__tests__/Daemon.fixture';

import { SimpleRoutesDnsSettings } from '../ui/SimpleRoutesDnsSettings';

const TEXT = JSON.stringify({
  dns: { servers: [{ type: 'tcp', tag: 'office-dns', server: '192.0.2.1' }], final: 'office-dns' },
});

function openSettings(variant: string) {
  ConfigDocumentStore.getState().load(TEXT);
  server.use(
    http.get(DAEMON_ENDPOINT.status(), () =>
      HttpResponse.json({
        ...DAEMON_STATUS_FIXTURE,
        core: { type: 'sing-box', variant, version: '1.14.3-extended-2.7.3' },
      })
    )
  );
  renderWithQuery(<SimpleRoutesDnsSettings text={TEXT} />);
}

afterEach(() => {
  ConfigDocumentStore.getState().reset();
});

it('keeps the inventory readable on a core variant without verified DNS support', async () => {
  openSettings('unknown');
  expect(await screen.findByText('office-dns')).toBeVisible();
  expect(await screen.findByText(/для этой версии ядра/i)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Добавить сервер' })).toBeDisabled();
  expect(ConfigDocumentStore.getState().draft).toBeNull();
});

it('preserves a concurrent draft edit when the DNS server form is submitted', async () => {
  openSettings('extended');
  const user = userEvent.setup();
  const add = screen.getByRole('button', { name: 'Добавить сервер' });
  await waitFor(() => expect(add).toBeEnabled());
  await user.click(add);
  await user.type(screen.getByLabelText('Имя сервера'), 'backup');
  await user.type(screen.getByLabelText('Адрес DNS-сервера'), '192.0.2.53');

  ConfigDocumentStore.getState().edit(['log', 'level'], 'warn');
  const concurrent = ConfigDocumentStore.getState().draft;
  await user.click(screen.getByRole('button', { name: 'Добавить в черновик' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(/конфигурация изменилась/i);
  expect(ConfigDocumentStore.getState().draft).toBe(concurrent);
});
