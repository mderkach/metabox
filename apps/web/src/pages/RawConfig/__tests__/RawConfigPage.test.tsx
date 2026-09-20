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

/** Схема такое не примет: `rules` обязан быть списком. */
const UNPARSED_CONFIG = JSON.stringify({ route: { rules: 'всё направо' } }, null, 2);

function serveConfig(text: string) {
  server.use(
    http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(text)),
    // Бар применения живёт в оболочке и опрашивает демона на каждом экране.
    http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json(DAEMON_STATUS_FIXTURE))
  );
}

describe('конфиг текстом', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
  });

  it('показывает файл с устройства как есть', async () => {
    serveConfig(VALID_CONFIG);

    renderWithRouter(RawConfigPage);

    const editor = await screen.findByRole('textbox', { name: 'Конфиг sing-box текстом' });

    expect(editor).toHaveValue(VALID_CONFIG);
  });

  it('открывается, когда схема конфиг не приняла: формы нельзя, текст можно', async () => {
    serveConfig(UNPARSED_CONFIG);

    renderWithRouter(RawConfigPage);

    expect(await screen.findByText('Схема не приняла этот конфиг')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Конфиг sing-box текстом' })).toHaveValue(UNPARSED_CONFIG);
  });

  it('ошибка разбора не стирает введённый текст', async () => {
    serveConfig(VALID_CONFIG);

    const user = userEvent.setup();

    renderWithRouter(RawConfigPage);

    const editor = await screen.findByRole('textbox', { name: 'Конфиг sing-box текстом' });

    await user.clear(editor);
    await user.type(editor, '{{ "route": ');

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(editor).toHaveValue('{ "route": ');
  });

  it('правка уходит в черновик, а файл на устройстве не трогается', async () => {
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

  // Одно действие не существует под двумя именами: откатом владеет бар применения.
  it('своей кнопки отката у экрана нет: документом владеет бар применения', async () => {
    serveConfig(VALID_CONFIG);

    renderWithRouter(RawConfigPage);

    await screen.findByRole('textbox', { name: 'Конфиг sing-box текстом' });

    expect(screen.queryByRole('button', { name: 'Вернуть версию с устройства' })).not.toBeInTheDocument();
  });

  it('отменённый черновик возвращает текст в поле, а не только в стор', async () => {
    serveConfig(VALID_CONFIG);

    const user = userEvent.setup();

    renderWithRouter(RawConfigPage);

    const editor = await screen.findByRole('textbox', { name: 'Конфиг sing-box текстом' });

    await user.type(editor, 'ЛИШНЕЕ');

    await waitFor(() => {
      expect(ConfigDocumentState.getState().draft).not.toBeNull();
    });

    // Отмену делает бар применения; экран обязан подхватить её полем ввода.
    act(() => {
      ConfigDocumentState.getState().discard();
    });

    // Редактор пересоздан вместе с документом, поэтому поле ищется заново.
    await waitFor(async () => {
      expect(await screen.findByRole('textbox', { name: 'Конфиг sing-box текстом' })).toHaveValue(VALID_CONFIG);
    });
  });
});
