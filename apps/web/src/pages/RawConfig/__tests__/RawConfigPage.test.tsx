import { renderWithRouter } from '@test/renderWithRouter';
import { server } from '@test/server';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { ConfigDocumentState } from '@entities/Config';
import { CONFIG_ENDPOINT } from '@entities/Config';
import { DAEMON_ENDPOINT } from '@entities/Daemon';
import { DAEMON_STATUS_FIXTURE } from '@entities/Daemon/__tests__/Daemon.fixture';

import { RawConfigPage } from '../ui/RawConfigPage';

const VALID_CONFIG = JSON.stringify({ route: { rules: [{ outbound: 'direct' }] } }, null, 2);

/** The schema will not accept this: `rules` must be a list. */
const UNPARSED_CONFIG = JSON.stringify({ route: { rules: 'всё направо' } }, null, 2);

function serveConfig(text: string) {
  server.use(
    http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(text)),
    // The apply bar lives in the shell and polls the daemon on every screen.
    http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json(DAEMON_STATUS_FIXTURE))
  );
}

describe('config as text', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
  });

  it('shows the file from the device as is', async () => {
    serveConfig(VALID_CONFIG);

    renderWithRouter(RawConfigPage);

    const editor = await screen.findByRole('textbox', { name: 'Конфиг sing-box текстом' });

    expect(editor).toHaveValue(VALID_CONFIG);
  });

  it('opens when the schema did not accept the config: forms are impossible, text is possible', async () => {
    serveConfig(UNPARSED_CONFIG);

    renderWithRouter(RawConfigPage);

    expect(await screen.findByText('Схема не приняла этот конфиг')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Конфиг sing-box текстом' })).toHaveValue(UNPARSED_CONFIG);
  });

  it('a parse error does not erase the typed text', async () => {
    serveConfig(VALID_CONFIG);

    const user = userEvent.setup();

    renderWithRouter(RawConfigPage);

    const editor = await screen.findByRole('textbox', { name: 'Конфиг sing-box текстом' });

    await user.clear(editor);
    await user.type(editor, '{{ "route": ');

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(editor).toHaveValue('{ "route": ');
  });

  it('an edit goes to the draft, and the file on the device is not touched', async () => {
    serveConfig(VALID_CONFIG);

    const user = userEvent.setup();

    renderWithRouter(RawConfigPage);

    const editor = await screen.findByRole('textbox', { name: 'Конфиг sing-box текстом' });

    await user.type(editor, ' ');

    await waitFor(() => {
      expect(ConfigDocumentState.getState().draft).not.toBeNull();
    });
    expect(ConfigDocumentState.getState().applied).toBe(VALID_CONFIG);
  });

  // One action does not exist under two names: the apply bar owns the rollback.
  it('the screen has no rollback button of its own: the apply bar owns the document', async () => {
    serveConfig(VALID_CONFIG);

    renderWithRouter(RawConfigPage);

    await screen.findByRole('textbox', { name: 'Конфиг sing-box текстом' });

    expect(screen.queryByRole('button', { name: 'Вернуть версию с устройства' })).not.toBeInTheDocument();
  });

  it('a cancelled draft returns the text to the field, not only to the store', async () => {
    serveConfig(VALID_CONFIG);

    const user = userEvent.setup();

    renderWithRouter(RawConfigPage);

    const editor = await screen.findByRole('textbox', { name: 'Конфиг sing-box текстом' });

    await user.type(editor, 'ЛИШНЕЕ');

    await waitFor(() => {
      expect(ConfigDocumentState.getState().draft).not.toBeNull();
    });

    // The cancel is done by the apply bar; the screen must pick it up with the input field.
    act(() => {
      ConfigDocumentState.getState().discard();
    });

    // The editor is recreated together with the document, so the field is looked up again.
    await waitFor(async () => {
      expect(await screen.findByRole('textbox', { name: 'Конфиг sing-box текстом' })).toHaveValue(VALID_CONFIG);
    });
  });
});
