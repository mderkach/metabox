import { renderWithRouter } from '@test/renderWithRouter';
import { selectOption } from '@test/selectOption';
import { server } from '@test/server';
import { mockVirtualSizes } from '@test/virtualSizes';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { ConfigDocumentState, findValue } from '@entities/Config';
import { API_ENDPOINT } from '@shared/api';

import { EditorPage } from '../ui/EditorPage';

const CONFIG = JSON.stringify(
  {
    outbounds: [
      { type: 'direct', tag: 'direct' },
      { type: 'selector', tag: 'proxy', outbounds: ['direct'] },
    ],
    route: {
      rules: [
        { rule_set: ['github'], outbound: 'proxy' },
        { port: 53, action: 'hijack-dns' },
        // Схема правил — `looseObject`, лишние ключи она принимает (AC-3).
        // Нераспознанным узел делает значение, которого нет ни в одной ветке
        // union: такое приходит от бинаря новее схемы панели.
        { action: 'quantum-teleport' },
      ],
    },
  },
  null,
  2
);

/** То же, но все узлы схема принимает: тогда у правила есть список исходов. */
const RECOGNIZED_CONFIG = JSON.stringify(
  {
    outbounds: [
      { type: 'direct', tag: 'direct' },
      { type: 'selector', tag: 'proxy', outbounds: ['direct'] },
    ],
    route: { rules: [{ rule_set: ['github'], outbound: 'proxy' }] },
  },
  null,
  2
);

function serveConfig(text = CONFIG) {
  server.use(http.get(API_ENDPOINT.config(), () => HttpResponse.text(text)));
}

describe('экран правил', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    mockVirtualSizes();
    serveConfig();
  });

  it('открывает панель по строке правила и закрывает её', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: 'Правило 1' }));

    const panel = await screen.findByRole('complementary');

    expect(within(panel).getByText('route.rules[0]')).toBeInTheDocument();

    await user.click(within(panel).getByRole('button', { name: 'Закрыть панель' }));

    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('форма исхода открывается на значении из конфига и не даёт применить пустую правку', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: 'Правило 1' }));

    const panel = await screen.findByRole('complementary');

    expect(within(panel).getByRole('combobox', { name: 'Куда отправить' })).toHaveTextContent('proxy');
    expect(within(panel).getByRole('button', { name: 'Применить к черновику' })).toBeDisabled();
  });

  it('смена исхода в панели меняет одну строку файла, остальное правило не трогает', async () => {
    // Конфиг без нераспознанного узла: список исходов строится по разобранному
    // конфигу, а узел, который схема не приняла, оставляет его пустым — тогда
    // выбирать было бы не из чего.
    serveConfig(RECOGNIZED_CONFIG);

    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: 'Правило 1' }));

    const panel = await screen.findByRole('complementary');
    const outbound = within(panel).getByRole('combobox', { name: 'Куда отправить' });

    await selectOption(user, outbound, 'direct');

    expect(outbound).toHaveTextContent('direct');

    await user.click(within(panel).getByRole('button', { name: 'Применить к черновику' }));

    await waitFor(() => {
      expect(ConfigDocumentState.getState().draft).not.toBeNull();
    });

    expect(findValue(ConfigDocumentState.getState().draft ?? '', ['route', 'rules', 0])).toEqual({
      rule_set: ['github'],
      outbound: 'direct',
    });
  });

  it('нераспознанный узел не получает формы, но правится текстом', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: 'Правило 3' }));

    const panel = await screen.findByRole('complementary');

    expect(within(panel).getByText('UI не покрывает')).toBeInTheDocument();
    expect(within(panel).getByRole('tab', { name: 'Форма' })).toHaveAttribute('aria-disabled', 'true');
    expect(within(panel).getByRole('textbox', { name: 'Правило 3 текстом' })).toBeInTheDocument();
  });

  it('битый JSON узла не стирает введённое и не уходит в черновик', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: 'Правило 2' }));

    const panel = await screen.findByRole('complementary');

    await user.click(within(panel).getByRole('tab', { name: 'JSON' }));

    const editor = within(panel).getByRole('textbox', { name: 'Правило 2 текстом' });

    await user.clear(editor);
    await user.type(editor, '{{ "port": ');
    await user.click(within(panel).getByRole('button', { name: 'Записать в черновик' }));

    expect(await within(panel).findByText('JSON не разобран')).toBeInTheDocument();
    expect(editor).toHaveValue('{ "port": ');
    expect(ConfigDocumentState.getState().draft).toBeNull();
  });

  it('переключение правила перезаряжает панель: текст узла берётся у нового правила', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: 'Правило 1' }));

    const panel = await screen.findByRole('complementary');

    await user.click(within(panel).getByRole('tab', { name: 'JSON' }));

    expect(within(panel).getByRole('textbox', { name: 'Правило 1 текстом' })).toHaveValue(
      JSON.stringify({ rule_set: ['github'], outbound: 'proxy' }, null, 2)
    );

    await user.click(screen.getByRole('button', { name: 'Правило 2' }));

    // Панель пересоздана и открылась на форме — вкладку выбираем заново.
    await user.click(within(await screen.findByRole('complementary')).getByRole('tab', { name: 'JSON' }));

    expect(await screen.findByRole('textbox', { name: 'Правило 2 текстом' })).toHaveValue(
      JSON.stringify({ port: 53, action: 'hijack-dns' }, null, 2)
    );
  });

  it('нераспознанный узел записывается в черновик: запрещать может только sing-box check', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: 'Правило 3' }));

    const panel = await screen.findByRole('complementary');
    const editor = within(panel).getByRole('textbox', { name: 'Правило 3 текстом' });

    await user.clear(editor);
    await user.type(editor, '{{ "action": "quantum-teleport", "port": 443 }');
    await user.click(within(panel).getByRole('button', { name: 'Записать в черновик' }));

    await waitFor(() => {
      expect(ConfigDocumentState.getState().draft).not.toBeNull();
    });

    expect(within(panel).getByText('Схема этот узел не знает — записан как есть')).toBeInTheDocument();
    const draft: unknown = JSON.parse(ConfigDocumentState.getState().draft ?? '');

    expect(findValue(JSON.stringify(draft), ['route', 'rules', 2])).toEqual({
      action: 'quantum-teleport',
      port: 443,
    });
  });
});
