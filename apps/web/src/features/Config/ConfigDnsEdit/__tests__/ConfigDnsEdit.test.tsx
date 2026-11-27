import { renderWithQuery } from '@test/renderWithQuery';
import { server } from '@test/server';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, expect, it } from 'vitest';

import { ConfigDocumentStore, useConfigCurrent } from '@entities/Config';
import { DAEMON_ENDPOINT } from '@entities/Daemon';
import { DAEMON_STATUS_FIXTURE } from '@entities/Daemon/__tests__/Daemon.fixture';

import { ConfigDnsEdit } from '../ui/ConfigDnsEdit';

const TEXT = JSON.stringify({
  dns: { servers: [{ type: 'tcp', tag: 'office-dns', server: '192.0.2.1' }], final: 'office-dns' },
});

function LiveDnsSettings() {
  const text = useConfigCurrent();
  return text === null ? null : <ConfigDnsEdit text={text} />;
}

function openSettings(variant: string, live = false) {
  ConfigDocumentStore.getState().load(TEXT);
  server.use(
    http.get(DAEMON_ENDPOINT.status(), () =>
      HttpResponse.json({
        ...DAEMON_STATUS_FIXTURE,
        core: { type: 'sing-box', variant, version: '1.14.3-extended-2.7.3' },
      })
    )
  );
  renderWithQuery(live ? <LiveDnsSettings /> : <ConfigDnsEdit text={TEXT} />);
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

async function fillServerForm() {
  const user = userEvent.setup();
  const add = screen.getByRole('button', { name: 'Добавить сервер' });
  await waitFor(() => expect(add).toBeEnabled());
  await user.click(add);
  await user.type(screen.getByLabelText('Имя сервера'), 'backup');
  await user.type(screen.getByLabelText('Адрес DNS-сервера'), '192.0.2.53');
  return { user, add };
}

it('publishes the new resolver in one draft update and returns focus to the trigger', async () => {
  openSettings('extended', true);
  const { user, add } = await fillServerForm();
  const updates: unknown[] = [];
  const unsubscribe = ConfigDocumentStore.subscribe((state) => updates.push(state.draft));
  try {
    await user.click(screen.getByRole('button', { name: 'Добавить в черновик' }));
    expect(await screen.findByRole('status')).toHaveTextContent('backup');
    expect(add).toHaveFocus();
    expect(updates).toHaveLength(1);
  } finally {
    unsubscribe();
  }
});

it('preserves a concurrent draft edit when the DNS server form is submitted', async () => {
  openSettings('extended');
  const { user } = await fillServerForm();

  ConfigDocumentStore.getState().edit(['log', 'level'], 'warn');
  const concurrent = ConfigDocumentStore.getState().draft;
  const updates: unknown[] = [];
  const unsubscribe = ConfigDocumentStore.subscribe((state) => updates.push(state.draft));
  try {
    await user.click(screen.getByRole('button', { name: 'Добавить в черновик' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/конфигурация изменилась/i);
    expect(ConfigDocumentStore.getState().draft).toBe(concurrent);
    expect(updates).toHaveLength(0);
  } finally {
    unsubscribe();
  }
});
