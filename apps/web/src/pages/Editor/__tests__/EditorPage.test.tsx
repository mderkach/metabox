import { renderWithRouter } from '@test/renderWithRouter';
import { selectOption } from '@test/selectOption';
import { server } from '@test/server';
import { finishSidePanelTransition } from '@test/sidePanel';
import { mockVirtualSizes } from '@test/virtualSizes';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfigDocumentState, findValue } from '@entities/Config';
import { CONFIG_ENDPOINT } from '@entities/Config';
import { DAEMON_ENDPOINT } from '@entities/Daemon';
import { DAEMON_STATUS_FIXTURE } from '@entities/Daemon/__tests__/Daemon.fixture';
import { ROUTE_ENDPOINT } from '@entities/Route';
import { parseRuleSearch } from '@entities/Rule';
import { PANEL_AS_SHEET } from '@shared/lib/media';

import { toSelectedRuleId } from '../lib/Editor.lib';
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
        // The rule schema is a `looseObject`, it accepts extra keys.
        // A node becomes unrecognized by a value that is in no branch of the
        // union: that comes from a binary newer than the panel schema.
        { action: 'quantum-teleport' },
      ],
    },
  },
  null,
  2
);

/** The same, but the schema accepts all nodes: then the rule has an outbound list. */
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

/** Rules for list editing: the schema accepts all nodes, the default route is set. */
const EDIT_RULES = [
  { rule_set: ['github'], outbound: 'proxy' },
  { port: 53, action: 'hijack-dns' },
  { domain_suffix: ['example.org'], outbound: 'direct' },
];

function editConfig(rules: unknown[]): string {
  return JSON.stringify(
    {
      outbounds: [
        { type: 'direct', tag: 'direct' },
        { type: 'selector', tag: 'proxy', outbounds: ['direct'] },
      ],
      route: { rules, final: 'proxy' },
    },
    null,
    2
  );
}

function draftRules(): unknown {
  return findValue(ConfigDocumentState.getState().draft ?? '', ['route', 'rules']);
}

/** Count of a process that runs `CONFIG`: one per node. */
const HITS = {
  seconds: 2 * 60 * 60,
  rules: [
    { index: 0, hits: 1234, counted: true },
    { index: 1, hits: 0, counted: false },
    { index: 2, hits: 5, counted: true },
  ],
  final: 0,
};

function serveConfig(text = CONFIG, hits: typeof HITS = HITS) {
  server.use(
    http.get(ROUTE_ENDPOINT.hits(), () => HttpResponse.json(hits)),
    http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(text)),
    // The screen header opens the version history, and the apply bar polls the daemon.
    http.get(CONFIG_ENDPOINT.versions(), () => HttpResponse.json({ versions: [] })),
    http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json(DAEMON_STATUS_FIXTURE))
  );
}

describe('rules screen', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    mockVirtualSizes();
    serveConfig();
  });

  it('the header names the columns, the footer counts the rules', async () => {
    renderWithRouter(EditorPage);

    const table = await screen.findByRole('table', { name: 'Правила маршрутизации' });

    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent)
    ).toEqual(['№', 'Условия', 'Действие', 'Сработало']);
    expect(screen.getByRole('status')).toHaveTextContent('3 правила');
  });

  it('above the list names the rule check order', async () => {
    renderWithRouter(EditorPage);

    expect(await screen.findByText('сверху вниз, срабатывает первое подходящее')).toBeInTheDocument();
  });

  it('shows the hit count in the rule row', async () => {
    renderWithRouter(EditorPage);

    const table = await screen.findByRole('table', { name: 'Правила маршрутизации' });
    const [, firstRow] = within(table).getAllByRole('row');

    await waitFor(() => {
      expect(firstRow).toHaveTextContent('1 234');
    });
  });

  it('a rule the core does not show in the connection list gets "not visible", not zero', async () => {
    renderWithRouter(EditorPage);

    const table = await screen.findByRole('table', { name: 'Правила маршрутизации' });
    const [, , dnsRow] = within(table).getAllByRole('row');

    await waitFor(() => {
      expect(dnsRow).toHaveTextContent('—');
    });
    expect(
      within(dnsRow).getByRole('button', { name: /^sing-box не считает срабатывания таких правил/ })
    ).toBeInTheDocument();
  });

  it('a process on another config does not hand its count to the rows of this one', async () => {
    serveConfig(CONFIG, { ...HITS, rules: HITS.rules.slice(0, 2) });

    renderWithRouter(EditorPage);

    expect(await screen.findByText('sing-box работает на другой версии конфига — счёт не показан')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Сработало' })).not.toBeInTheDocument();
  });

  it('search filters rows, the footer reports both values', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.type(await screen.findByRole('textbox', { name: 'Поиск по правилам' }), 'github');

    expect(screen.getByRole('status')).toHaveTextContent('Показано 1 из 3');
  });

  it('opens the panel from a rule row and closes it', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: /^Правило 1, / }));

    const panel = await screen.findByRole('complementary');

    expect(within(panel).getByText('Правило 1', { selector: 'h2, h3' })).toBeInTheDocument();

    await user.click(within(panel).getByRole('button', { name: 'Закрыть панель' }));

    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('focus moves into the panel, and Escape closes it and returns focus to the row', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    const ruleButton = await screen.findByRole('button', { name: /^Правило 1, / });

    await user.click(ruleButton);

    const panel = await screen.findByRole('complementary');

    expect(within(panel).getByRole('heading', { name: 'Правило 1' })).toHaveFocus();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();

    finishSidePanelTransition();

    expect(ruleButton).toHaveFocus();
  });

  it('the close button returns focus to the row the panel was opened from', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    const ruleButton = await screen.findByRole('button', { name: /^Правило 3, / });

    await user.click(ruleButton);
    await user.click(within(await screen.findByRole('complementary')).getByRole('button', { name: 'Закрыть панель' }));

    finishSidePanelTransition();

    expect(ruleButton).toHaveFocus();
  });

  it('the outbound form opens on the value from the config and writes nothing until a change', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: /^Правило 1, / }));

    const panel = await screen.findByRole('complementary');

    expect(within(panel).getByRole('combobox', { name: 'Куда отправить' })).toHaveTextContent('proxy');
    expect(ConfigDocumentState.getState().draft).toBeNull();
  });

  it('an outbound change in the panel edits one line of the file, does not touch the rest of the rule', async () => {
    // A config without an unrecognized node: the outbound list is built from the parsed
    // config, and a node the schema did not accept leaves it empty: then
    // there would be nothing to choose from.
    serveConfig(RECOGNIZED_CONFIG);

    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: /^Правило 1, / }));

    const panel = await screen.findByRole('complementary');
    const outbound = within(panel).getByRole('combobox', { name: 'Куда отправить' });

    await selectOption(user, outbound, 'direct');

    expect(outbound).toHaveTextContent('direct');

    await waitFor(() => {
      expect(ConfigDocumentState.getState().draft).not.toBeNull();
    });

    expect(findValue(ConfigDocumentState.getState().draft ?? '', ['route', 'rules', 0])).toEqual({
      rule_set: ['github'],
      outbound: 'direct',
    });
    expect(
      await screen.findByRole('button', { name: 'Правило 1, выход direct, изменено в черновике' })
    ).toBeInTheDocument();
  });

  it('an outbound chosen in the form survives a switch to JSON and back', async () => {
    serveConfig(RECOGNIZED_CONFIG);

    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: /^Правило 1, / }));

    const panel = await screen.findByRole('complementary');

    await selectOption(user, within(panel).getByRole('combobox', { name: 'Куда отправить' }), 'direct');
    await user.click(within(panel).getByRole('tab', { name: 'JSON' }));
    await waitFor(() => {
      expect(within(panel).queryByRole('combobox', { name: 'Куда отправить' })).not.toBeInTheDocument();
    });
    await user.click(within(panel).getByRole('tab', { name: 'Форма' }));

    expect(within(panel).getByRole('combobox', { name: 'Куда отправить' })).toHaveTextContent('direct');
  });

  it('an unrecognized node gets no form, but is edited as text', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: /^Правило 3, / }));

    const panel = await screen.findByRole('complementary');

    expect(within(panel).getByText('панель не знает')).toBeInTheDocument();
    expect(within(panel).getByRole('tab', { name: 'Форма' })).toHaveAttribute('aria-disabled', 'true');
    expect(within(panel).getByRole('textbox', { name: 'Правило 3 текстом' })).toBeInTheDocument();
  });

  it('broken node JSON does not erase the input and does not go into the draft', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: /^Правило 2, / }));

    const panel = await screen.findByRole('complementary');

    await user.click(within(panel).getByRole('tab', { name: 'JSON' }));

    const editor = within(panel).getByRole('textbox', { name: 'Правило 2 текстом' });

    await user.clear(editor);
    await user.type(editor, '{{ "port": ');

    expect(await within(panel).findByText(/В черновик не записано/)).toBeInTheDocument();
    expect(editor).toHaveValue('{ "port": ');
    expect(ConfigDocumentState.getState().draft).toBeNull();
  });

  it('switching the rule reloads the panel: the node text is taken from the new rule', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: /^Правило 1, / }));

    const panel = await screen.findByRole('complementary');

    await user.click(within(panel).getByRole('tab', { name: 'JSON' }));

    expect(within(panel).getByRole('textbox', { name: 'Правило 1 текстом' })).toHaveValue(
      JSON.stringify({ rule_set: ['github'], outbound: 'proxy' }, null, 2)
    );

    await user.click(screen.getByRole('button', { name: /^Правило 2, / }));

    // The panel is recreated and opened on the form: choose the tab again.
    await user.click(within(await screen.findByRole('complementary')).getByRole('tab', { name: 'JSON' }));

    expect(await screen.findByRole('textbox', { name: 'Правило 2 текстом' })).toHaveValue(
      JSON.stringify({ port: 53, action: 'hijack-dns' }, null, 2)
    );
  });

  it('an unrecognized node is written to the draft: only sing-box check may forbid it', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: /^Правило 3, / }));

    const panel = await screen.findByRole('complementary');
    const editor = within(panel).getByRole('textbox', { name: 'Правило 3 текстом' });

    await user.clear(editor);
    await user.type(editor, '{{ "action": "quantum-teleport", "port": 443 }');

    await waitFor(() => {
      expect(ConfigDocumentState.getState().draft).not.toBeNull();
    });

    expect(within(panel).getByText('Панель не знает часть полей — правило записано как есть')).toBeInTheDocument();
    const draft: unknown = JSON.parse(ConfigDocumentState.getState().draft ?? '');

    expect(findValue(JSON.stringify(draft), ['route', 'rules', 2])).toEqual({
      action: 'quantum-teleport',
      port: 443,
    });
  });

  it('a source failure shows the reason and a retry, not an empty list', async () => {
    const user = userEvent.setup();

    server.use(
      http.get(CONFIG_ENDPOINT.config(), () =>
        HttpResponse.json({ code: 'config_missing', message: 'config not found' }, { status: 404 })
      )
    );

    renderWithRouter(EditorPage);

    expect(await screen.findByText('Не удалось загрузить конфиг')).toBeInTheDocument();
    expect(screen.getByText('конфига на устройстве нет')).toBeInTheDocument();

    serveConfig();
    await user.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(await screen.findByRole('table', { name: 'Правила маршрутизации' })).toBeInTheDocument();
  });

  it('a config without rules says so instead of showing an empty space', async () => {
    serveConfig(JSON.stringify({ outbounds: [{ type: 'direct', tag: 'direct' }] }));

    renderWithRouter(EditorPage);

    expect(await screen.findByText('Правил нет')).toBeInTheDocument();
  });

  it('route scalars are edited by the form above the rules: route.final changes, the rules are intact', async () => {
    const user = userEvent.setup();

    serveConfig(RECOGNIZED_CONFIG);
    renderWithRouter(EditorPage);

    const settings = within(await screen.findByRole('region', { name: 'Параметры маршрутизации' }));

    await user.click(settings.getByRole('button', { name: 'Параметры маршрутизации' }));
    await user.click(settings.getByRole('button', { name: /^Ещё параметры/ }));
    await user.type(settings.getByRole('textbox', { name: 'final' }), 'proxy');

    await waitFor(() => {
      expect(findValue(ConfigDocumentState.getState().draft ?? '', ['route', 'final'])).toBe('proxy');
    });
    expect(findValue(ConfigDocumentState.getState().draft ?? '', ['route', 'rules', 0, 'outbound'])).toBe('proxy');
  });
});

describe('rule list editing', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    mockVirtualSizes();
    serveConfig(editConfig(EDIT_RULES));
  });

  it('names an action in words in the outbound filter and in the row, not as an outbound', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: 'Действия правил' }));

    const targets = await screen.findByRole('listbox', { name: 'Действия правил' });

    expect(within(targets).getByRole('option', { name: /перехватить DNS/ })).toBeInTheDocument();
    expect(within(targets).queryByRole('option', { name: /hijack-dns/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Правило 2, действие: перехватить DNS' })).toBeInTheDocument();
  });

  it('the outbound facet selects several outbounds at once and keeps them in the address', async () => {
    const user = userEvent.setup();
    const { router } = renderWithRouter(EditorPage, { validateSearch: parseRuleSearch });

    await user.click(await screen.findByRole('button', { name: 'Действия правил' }));

    const targets = await screen.findByRole('listbox', { name: 'Действия правил' });

    expect(targets).toHaveAttribute('aria-multiselectable', 'true');

    await user.click(within(targets).getByRole('option', { name: /proxy/ }));

    expect(await screen.findByRole('status')).toHaveTextContent('Показано 1 из 3');
    expect(router.state.location.search).toEqual({ target: 'proxy' });

    await user.click(within(targets).getByRole('option', { name: /direct/ }));

    expect(await screen.findByRole('status')).toHaveTextContent('Показано 2 из 3');
    expect(router.state.location.search).toEqual({ target: ['proxy', 'direct'] });
    expect(screen.getByRole('button', { name: 'Действия правил: выбрано 2' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Правило 2, / })).not.toBeInTheDocument();
  });

  it('opens with the outbounds selected in the address, and the search narrows their counters', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage, { validateSearch: parseRuleSearch, initialEntry: '/?target=hijack-dns' });

    expect(await screen.findByRole('button', { name: 'Правило 2, действие: перехватить DNS' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Показано 1 из 3');

    await user.type(screen.getByRole('textbox', { name: 'Поиск по правилам' }), 'github');
    await user.click(screen.getByRole('button', { name: 'Действия правил: перехватить DNS' }));

    const targets = await screen.findByRole('listbox', { name: 'Действия правил' });

    expect(within(targets).getByRole('option', { name: /proxy/ })).toHaveTextContent(/1$/);
    expect(within(targets).getByRole('option', { name: /перехватить DNS/ })).toHaveTextContent(/0$/);
  });

  it('opens a new rule without writing it and writes it on the first condition, keeping focus', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: 'Добавить правило' }));

    const panel = await screen.findByRole('complementary', { name: 'Новое правило · место 4' });

    expect(ConfigDocumentState.getState().draft).toBeNull();
    expect(within(panel).getByText(/появится в черновике, когда у него будет условие/)).toBeInTheDocument();
    expect(within(panel).queryByRole('tab', { name: 'JSON' })).not.toBeInTheDocument();

    await selectOption(user, within(panel).getByRole('combobox', { name: 'Добавить условие' }), 'Домен');

    const domain = within(panel).getByRole('textbox', { name: 'Домен' });

    await user.type(domain, 'a.example');

    await waitFor(() => {
      expect(draftRules()).toEqual([...EDIT_RULES, { domain: ['a.example'], outbound: 'proxy' }]);
    });
    expect(domain).toHaveFocus();
    expect(await screen.findByRole('button', { name: 'Правило 4, выход proxy, изменено в черновике' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('closes the panel of a created rule once the draft is discarded', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: 'Добавить правило' }));

    const panel = await screen.findByRole('complementary', { name: 'Новое правило · место 4' });

    await selectOption(user, within(panel).getByRole('combobox', { name: 'Добавить условие' }), 'Домен');
    await user.type(within(panel).getByRole('textbox', { name: 'Домен' }), 'a.example');
    await screen.findByRole('button', { name: 'Правило 4, выход proxy, изменено в черновике' });

    act(() => {
      ConfigDocumentState.getState().discard();
    });

    await waitFor(() => {
      expect(screen.queryByRole('complementary', { name: 'Правило 4' })).not.toBeInTheDocument();
    });
  });

  it('a new rule closed without a condition leaves the draft untouched', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: 'Добавить правило' }));

    const panel = await screen.findByRole('complementary', { name: 'Новое правило · место 4' });

    await user.click(within(panel).getByRole('button', { name: 'Закрыть панель' }));

    expect(ConfigDocumentState.getState().draft).toBeNull();
  });

  it('in a config without rules the empty state button opens the first rule and the condition creates route.rules', async () => {
    serveConfig(JSON.stringify({ outbounds: [{ type: 'direct', tag: 'direct' }] }, null, 2));

    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    expect(await screen.findByText('Правил нет')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Добавить правило' }));

    const panel = await screen.findByRole('complementary', { name: 'Новое правило · место 1' });

    expect(ConfigDocumentState.getState().draft).toBeNull();

    await selectOption(user, within(panel).getByRole('combobox', { name: 'Добавить условие' }), 'Домен');
    await user.type(within(panel).getByRole('textbox', { name: 'Домен' }), 'a.example');

    await waitFor(() => {
      expect(draftRules()).toEqual([{ domain: ['a.example'], outbound: 'direct' }]);
    });
    expect(await screen.findByRole('table', { name: 'Правила маршрутизации' })).toBeInTheDocument();
  });

  it('without outbounds and route.final a new rule has nowhere to get an outbound: the button is disabled and says why', async () => {
    serveConfig('{}');

    renderWithRouter(EditorPage);

    expect(await screen.findByRole('button', { name: 'Добавить правило' })).toBeDisabled();
    expect(screen.getByText(/нет ни route\.final, ни аутбаунда/)).toBeInTheDocument();
  });

  it('adding with an active search clears the filter: the new rule will be visible in the list', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    const search = await screen.findByRole('textbox', { name: 'Поиск по правилам' });

    await user.type(search, 'github');

    expect(screen.getByRole('status')).toHaveTextContent('Показано 1 из 3');

    await user.click(screen.getByRole('button', { name: 'Добавить правило' }));

    expect(search).toHaveValue('');
    expect(screen.getByRole('status')).toHaveTextContent('3 правила');
    expect(await screen.findByRole('complementary', { name: 'Новое правило · место 4' })).toBeInTheDocument();
  });

  it('deleting after confirmation removes the node and closes the panel, does not touch neighbors', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: /^Правило 2, / }));
    await user.click(
      within(await screen.findByRole('complementary')).getByRole('button', { name: 'Удалить правило 2' })
    );
    await user.click(
      within(screen.getByRole('alertdialog', { name: 'Удалить правило 2?' })).getByRole('button', { name: 'Удалить' })
    );

    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    // The file without rule 2 is the same text as it was, line for line.
    expect(ConfigDocumentState.getState().draft).toBe(editConfig([EDIT_RULES[0], EDIT_RULES[2]]));
    expect(screen.getByRole('status')).toHaveTextContent('2 правила');
  });

  it('cancelling the confirmation keeps the rule and the panel', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: /^Правило 2, / }));
    await user.click(
      within(await screen.findByRole('complementary')).getByRole('button', { name: 'Удалить правило 2' })
    );
    await user.click(
      within(screen.getByRole('alertdialog', { name: 'Удалить правило 2?' })).getByRole('button', { name: 'Отмена' })
    );

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    expect(ConfigDocumentState.getState().draft).toBeNull();
    expect(screen.getByRole('complementary')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('3 правила');
  });

  it('"Up" moves the rule, and the panel stays on it together with the tab and focus', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: /^Правило 3, / }));

    const panel = await screen.findByRole('complementary');

    await user.click(within(panel).getByRole('tab', { name: 'JSON' }));
    await user.click(within(panel).getByRole('button', { name: 'Поднять правило 3 выше' }));

    expect(draftRules()).toEqual([EDIT_RULES[0], EDIT_RULES[2], EDIT_RULES[1]]);
    expect(within(panel).getByRole('heading', { name: 'Правило 2' })).toBeInTheDocument();
    expect(within(panel).getByText('Правило 2', { selector: 'h2, h3' })).toBeInTheDocument();
    // The panel is not recreated: the open tab stayed, and the node text is the same.
    expect(within(panel).getByRole('tab', { name: 'JSON' })).toHaveAttribute('aria-selected', 'true');
    expect(within(panel).getByRole('textbox', { name: 'Правило 2 текстом' })).toHaveValue(
      JSON.stringify(EDIT_RULES[2], null, 2)
    );
    expect(within(panel).getByRole('button', { name: 'Поднять правило 2 выше' })).toHaveFocus();
  });

  it('cancelling the draft after a move opens in the form the node that is now at the selected place', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: /^Правило 3, / }));

    const panel = await screen.findByRole('complementary');

    await user.click(within(panel).getByRole('button', { name: 'Поднять правило 3 выше' }));
    await user.click(within(panel).getByRole('button', { name: 'Поднять правило 2 выше' }));

    expect(within(panel).getByRole('combobox', { name: 'Куда отправить' })).toHaveTextContent('direct');

    act(() => {
      ConfigDocumentState.getState().discard();
    });

    // The selection stayed at the first position, and there is rule 1 of the file again.
    expect(within(panel).getByRole('heading', { name: 'Правило 1' })).toBeInTheDocument();
    expect(within(panel).getByRole('combobox', { name: 'Куда отправить' })).toHaveTextContent('proxy');
  });

  it('in the first place "Up" goes out and focus goes to "Down", it is not lost', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: /^Правило 2, / }));

    const panel = await screen.findByRole('complementary');

    await user.click(within(panel).getByRole('button', { name: 'Поднять правило 2 выше' }));

    expect(within(panel).getByRole('button', { name: 'Поднять правило 1 выше' })).toBeDisabled();
    expect(within(panel).getByRole('button', { name: 'Опустить правило 1 ниже' })).toHaveFocus();
  });

  it('a moved rule keeps its hit count and is not marked changed', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: /^Правило 1, / }));
    await user.click(
      within(await screen.findByRole('complementary')).getByRole('button', { name: 'Опустить правило 1 ниже' })
    );

    const table = screen.getByRole('table', { name: 'Правила маршрутизации' });
    const [, , secondRow] = within(table).getAllByRole('row');

    expect(within(secondRow).getByRole('button', { name: 'Правило 2, выход proxy' })).toBeInTheDocument();
    expect(await within(secondRow).findByText('1 234')).toBeInTheDocument();
    expect(screen.queryByText('изменено в черновике', { exact: false })).not.toBeInTheDocument();
  });
});

describe('rules screen on a narrow screen', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    mockVirtualSizes();
    serveConfig();
    vi.stubGlobal('matchMedia', function matchQuery(media: string) {
      return {
        matches: media === PANEL_AS_SHEET,
        media,
        addEventListener: vi.fn<() => void>(),
        removeEventListener: vi.fn<() => void>(),
      };
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens a rule as a sheet over the list, not under it', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: /^Правило 1, / }));

    const sheet = await screen.findByRole('dialog', { name: 'Правило 1' });

    expect(within(sheet).getByText('Правило 1', { selector: 'h2, h3' })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});

describe('rule list editing on a narrow screen', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    mockVirtualSizes();
    serveConfig(editConfig(EDIT_RULES));
    vi.stubGlobal('matchMedia', function matchQuery(media: string) {
      return {
        matches: media === PANEL_AS_SHEET,
        media,
        addEventListener: vi.fn<() => void>(),
        removeEventListener: vi.fn<() => void>(),
      };
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('the sheet stays on the moved rule and is not recreated', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: /^Правило 1, / }));

    const sheet = await screen.findByRole('dialog', { name: 'Правило 1' });

    await user.click(within(sheet).getByRole('tab', { name: 'JSON' }));
    await user.click(within(sheet).getByRole('button', { name: 'Опустить правило 1 ниже' }));

    expect(await screen.findByRole('dialog', { name: 'Правило 2' })).toBe(sheet);
    expect(within(sheet).getByRole('tab', { name: 'JSON' })).toHaveAttribute('aria-selected', 'true');
    expect(draftRules()).toEqual([EDIT_RULES[1], EDIT_RULES[0], EDIT_RULES[2]]);
  });
});

describe('rule outbound tone', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    mockVirtualSizes();
  });

  it('the outbound is colored by outbound type, not by the tag name', async () => {
    serveConfig(
      JSON.stringify({
        outbounds: [
          { type: 'direct', tag: 'direct' },
          { type: 'vless', tag: 'directional', server: 'example.com', server_port: 443, uuid: 'REDACTED' },
        ],
        route: {
          rules: [
            { domain_suffix: ['example.org'], outbound: 'directional' },
            { domain_suffix: ['ru'], outbound: 'direct' },
          ],
        },
      })
    );

    renderWithRouter(EditorPage);

    const table = await screen.findByRole('table', { name: 'Правила маршрутизации' });
    const [, proxyRow, directRow] = within(table).getAllByRole('row');

    // The subject of the test is the tone itself: the fate of the traffic is read from it.
    expect(within(proxyRow).getByText('directional')).toHaveClass('text-route-proxy');
    expect(within(proxyRow).getByText('directional')).not.toHaveClass('text-route-direct');
    expect(within(directRow).getByText('direct')).toHaveClass('text-route-direct');
  });
});

describe('filter by rule set from the address', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    mockVirtualSizes();
    serveConfig();
  });

  function renderWithRuleSet(tag: string) {
    return renderWithRouter(EditorPage, {
      validateSearch: parseRuleSearch,
      initialEntry: `/?rule_set=${tag}`,
    });
  }

  it('shows only rules that refer to the rule set', async () => {
    renderWithRuleSet('github');

    const table = await screen.findByRole('table', { name: 'Правила маршрутизации' });

    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(screen.getByRole('status')).toHaveTextContent('Показано 1 из 3');
  });

  it('is cleared by the filter button and leaves the address', async () => {
    const user = userEvent.setup();
    const { router } = renderWithRuleSet('github');

    await user.click(await screen.findByRole('button', { name: 'Снять отбор: сет github' }));

    expect(await screen.findByRole('status')).toHaveTextContent('3 правила');
    expect(router.state.location.search).toEqual({});
  });

  it('a rule set without rules gives an empty filter, and its reset returns the list', async () => {
    const user = userEvent.setup();

    renderWithRuleSet('geoip-ru');

    expect(await screen.findByText('Ничего не нашлось по этому запросу.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Сбросить отбор' }));

    expect(await screen.findByRole('status')).toHaveTextContent('3 правила');
  });
});

describe('rule sets of a rule from the panel', () => {
  /** Rules for editing and two sets that can be referred to. */
  const WITH_RULE_SETS = JSON.stringify(
    {
      outbounds: [
        { type: 'direct', tag: 'direct' },
        { type: 'selector', tag: 'proxy', outbounds: ['direct'] },
      ],
      route: {
        rules: EDIT_RULES,
        final: 'proxy',
        rule_set: [
          { type: 'remote', tag: 'github', format: 'binary', url: 'https://example.invalid/github.srs' },
          { type: 'remote', tag: 'geoip-cn', format: 'binary', url: 'https://example.invalid/geoip-cn.srs' },
        ],
      },
    },
    null,
    2
  );

  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    mockVirtualSizes();
    serveConfig(WITH_RULE_SETS);
  });

  it('a rule set chosen in the form is visible in the rule conditions and in the rule set filter', async () => {
    const user = userEvent.setup();
    const { router } = renderWithRouter(EditorPage, { validateSearch: parseRuleSearch });

    await user.click(await screen.findByRole('button', { name: /^Правило 3, / }));

    const panel = await screen.findByRole('complementary');

    await selectOption(user, within(panel).getByRole('combobox', { name: 'Сеты правил' }), 'geoip-cn');
    await user.keyboard('{Escape}');

    // Escape closes the list, not the panel around it.
    expect(panel).toBeInTheDocument();

    await waitFor(() => {
      expect(
        within(panel)
          .getAllByRole('definition')
          .map((value) => value.textContent)
      ).toContain('geoip-cn');
    });
    expect(draftRules()).toEqual([
      EDIT_RULES[0],
      EDIT_RULES[1],
      { domain_suffix: ['example.org'], outbound: 'direct', rule_set: ['geoip-cn'] },
    ]);

    await router.navigate({ to: '/', search: { rule_set: 'geoip-cn' } });

    expect(await screen.findByRole('status')).toHaveTextContent('Показано 1 из 3');
    expect(screen.getByRole('button', { name: /^Правило 3, / })).toBeInTheDocument();
  });
});

describe('rule number from the address', () => {
  it('converts the interface number to a node index', () => {
    expect(toSelectedRuleId(1)).toBe('0');
    expect(toSelectedRuleId(7)).toBe('6');
  });

  it('without a number in the address selects nothing', () => {
    expect(toSelectedRuleId(undefined)).toBeNull();
  });
});
