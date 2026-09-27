import { renderWithRouter } from '@test/renderWithRouter';
import { server } from '@test/server';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { CONFIG_ENDPOINT, ConfigDocumentState } from '@entities/Config';
import { DAEMON_ENDPOINT } from '@entities/Daemon';
import { DAEMON_STATUS_FIXTURE } from '@entities/Daemon/__tests__/Daemon.fixture';

import { SectionNodes } from '../ui/SectionPage';

const CONFIG_TEXT = `{
  // выходы
  "outbounds": [
    { "type": "direct", "tag": "direct" },
    { "type": "vless", "tag": "hk-01", "server": "a.example" },
  ],
}`;

function serveConfig(text: string) {
  server.use(
    http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(text)),
    http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json(DAEMON_STATUS_FIXTURE))
  );
}

function OutboundsSection() {
  return <SectionNodes section='outbounds' />;
}

function ProvidersSection() {
  return <SectionNodes section='providers' />;
}

describe('экран секции', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
  });

  it('показывает каждый узел секции редактором JSON', async () => {
    serveConfig(CONFIG_TEXT);

    renderWithRouter(OutboundsSection);

    const editor = await screen.findByRole('textbox', { name: 'Узел hk-01 текстом' });

    expect(editor).toHaveValue(JSON.stringify({ type: 'vless', tag: 'hk-01', server: 'a.example' }, null, 2));
    expect(screen.getByRole('heading', { name: 'direct' })).toBeInTheDocument();
  });

  it('правка узла уходит в черновик точечно: комментарий и соседний узел целы', async () => {
    serveConfig(CONFIG_TEXT);

    const user = userEvent.setup();

    renderWithRouter(OutboundsSection);

    const editor = await screen.findByRole('textbox', { name: 'Узел direct текстом' });

    await user.clear(editor);
    await user.paste('{ "type": "direct", "tag": "main" }');

    // Кнопка у каждого узла своя; порядок кнопок повторяет порядок узлов.
    const [saveDirect] = screen.getAllByRole('button', { name: 'Сохранить в черновик' });

    await user.click(saveDirect);

    await waitFor(() => {
      expect(ConfigDocumentState.getState().draft).toContain('"tag": "main"');
    });

    const draft = ConfigDocumentState.getState().draft ?? '';

    expect(draft).toContain('// выходы');
    expect(draft).toContain('"hk-01"');
  });

  it('пустая секция-список названа пустой, а не сломанной', async () => {
    serveConfig(CONFIG_TEXT);

    renderWithRouter(ProvidersSection);

    expect(await screen.findByText('Узлов нет')).toBeInTheDocument();
  });
});
