import { renderWithRouter } from '@test/renderWithRouter';
import { selectOption } from '@test/selectOption';
import { server } from '@test/server';
import { mockVirtualSizes } from '@test/virtualSizes';
import { screen, waitFor, within } from '@testing-library/react';
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
        // Схема правил — `looseObject`, лишние ключи она принимает.
        // Нераспознанным узел делает значение, которого нет ни в одной ветке
        // union: такое приходит от бинаря новее схемы панели.
        { action: 'quantum-teleport' },
      ],
    },
  },
  null,
  2
);

/** То же, но все узлы схема принимает: тогда у правила есть список выходов. */
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

/** Правила для правки списка: все узлы схема принимает, маршрут по умолчанию задан. */
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

/** Счёт процесса, который работает на `CONFIG`: по правилу на узел. */
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
    // Шапка экрана открывает историю версий, а бар применения опрашивает демона.
    http.get(CONFIG_ENDPOINT.versions(), () => HttpResponse.json({ versions: [] })),
    http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json(DAEMON_STATUS_FIXTURE))
  );
}

describe('экран правил', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    mockVirtualSizes();
    serveConfig();
  });

  it('шапка называет колонки, подвал считает правила', async () => {
    renderWithRouter(EditorPage);

    const table = await screen.findByRole('table', { name: 'Правила маршрутизации' });

    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent)
    ).toEqual(['№', 'Условия', 'Выход', 'Сработало']);
    expect(screen.getByRole('status')).toHaveTextContent('3 правила');
  });

  it('над списком суть порядка одной строкой, а объяснение — по кнопке «?»', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    expect(await screen.findByText('сверху вниз, срабатывает первое подходящее')).toBeInTheDocument();
    expect(screen.queryByText(/никогда не выполнится/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Как работает порядок правил' }));

    expect(await screen.findByText(/никогда не выполнится/)).toBeInTheDocument();
  });

  it('показывает счёт срабатываний и окно счёта, чтобы ноль не читался как «правило мёртвое»', async () => {
    renderWithRouter(EditorPage);

    const table = await screen.findByRole('table', { name: 'Правила маршрутизации' });
    const [, firstRow] = within(table).getAllByRole('row');

    expect(
      await screen.findByText('Счёт срабатываний — за 2 ч с запуска metaboxd, перезапуск его обнуляет')
    ).toBeInTheDocument();
    expect(firstRow).toHaveTextContent('1 234');
  });

  it('правило, которого core в списке соединений не показывает, получает «не видно», а не ноль', async () => {
    renderWithRouter(EditorPage);

    const table = await screen.findByRole('table', { name: 'Правила маршрутизации' });
    const [, , dnsRow] = within(table).getAllByRole('row');

    expect(dnsRow).toHaveTextContent('не видно');
    expect(await screen.findByText(/^«не видно» — sing-box не показывает такие соединения/)).toBeInTheDocument();
  });

  it('процесс на другом конфиге не раздаёт свой счёт строкам этого', async () => {
    serveConfig(CONFIG, { ...HITS, rules: HITS.rules.slice(0, 2) });

    renderWithRouter(EditorPage);

    expect(
      await screen.findByText('sing-box работает не на этом конфиге — счёт срабатываний не показан')
    ).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Сработало' })).not.toBeInTheDocument();
  });

  it('поиск отбирает строки, подвал сообщает обе величины', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.type(await screen.findByRole('textbox', { name: 'Поиск по правилам' }), 'github');

    expect(screen.getByRole('status')).toHaveTextContent('Показано 1 из 3');
  });

  it('открывает панель по строке правила и закрывает её', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: /^Правило 1, / }));

    const panel = await screen.findByRole('complementary');

    expect(within(panel).getByText('route.rules[0]')).toBeInTheDocument();

    await user.click(within(panel).getByRole('button', { name: 'Закрыть панель' }));

    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('фокус уходит в панель, а Escape закрывает её и возвращает фокус на строку', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    const ruleButton = await screen.findByRole('button', { name: /^Правило 1, / });

    await user.click(ruleButton);

    const panel = await screen.findByRole('complementary');

    expect(within(panel).getByRole('heading', { name: 'Правило 1' })).toHaveFocus();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(ruleButton).toHaveFocus();
  });

  it('форма выхода открывается на значении из конфига и не даёт применить пустую правку', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: /^Правило 1, / }));

    const panel = await screen.findByRole('complementary');

    expect(within(panel).getByRole('combobox', { name: 'Куда отправить' })).toHaveTextContent('proxy');
    expect(within(panel).getByRole('button', { name: 'Сохранить в черновик' })).toBeDisabled();
  });

  it('смена выхода в панели меняет одну строку файла, остальное правило не трогает', async () => {
    // Конфиг без нераспознанного узла: список выходов строится по разобранному
    // конфигу, а узел, который схема не приняла, оставляет его пустым — тогда
    // выбирать было бы не из чего.
    serveConfig(RECOGNIZED_CONFIG);

    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: /^Правило 1, / }));

    const panel = await screen.findByRole('complementary');
    const outbound = within(panel).getByRole('combobox', { name: 'Куда отправить' });

    await selectOption(user, outbound, 'direct');

    expect(outbound).toHaveTextContent('direct');

    await user.click(within(panel).getByRole('button', { name: 'Сохранить в черновик' }));

    await waitFor(() => {
      expect(ConfigDocumentState.getState().draft).not.toBeNull();
    });

    expect(findValue(ConfigDocumentState.getState().draft ?? '', ['route', 'rules', 0])).toEqual({
      rule_set: ['github'],
      outbound: 'direct',
    });
    expect(within(panel).getByRole('button', { name: 'Сохранить в черновик' })).toBeDisabled();
    expect(
      await screen.findByRole('button', { name: 'Правило 1, выход direct, изменено в черновике' })
    ).toBeInTheDocument();
  });

  it('нераспознанный узел не получает формы, но правится текстом', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: /^Правило 3, / }));

    const panel = await screen.findByRole('complementary');

    expect(within(panel).getByText('UI не покрывает')).toBeInTheDocument();
    expect(within(panel).getByRole('tab', { name: 'Форма' })).toHaveAttribute('aria-disabled', 'true');
    expect(within(panel).getByRole('textbox', { name: 'Правило 3 текстом' })).toBeInTheDocument();
  });

  it('битый JSON узла не стирает введённое и не уходит в черновик', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: /^Правило 2, / }));

    const panel = await screen.findByRole('complementary');

    await user.click(within(panel).getByRole('tab', { name: 'JSON' }));

    const editor = within(panel).getByRole('textbox', { name: 'Правило 2 текстом' });

    await user.clear(editor);
    await user.type(editor, '{{ "port": ');
    await user.click(within(panel).getByRole('button', { name: 'Сохранить в черновик' }));

    expect(await within(panel).findByText('JSON не разобран')).toBeInTheDocument();
    expect(editor).toHaveValue('{ "port": ');
    expect(ConfigDocumentState.getState().draft).toBeNull();
  });

  it('переключение правила перезаряжает панель: текст узла берётся у нового правила', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: /^Правило 1, / }));

    const panel = await screen.findByRole('complementary');

    await user.click(within(panel).getByRole('tab', { name: 'JSON' }));

    expect(within(panel).getByRole('textbox', { name: 'Правило 1 текстом' })).toHaveValue(
      JSON.stringify({ rule_set: ['github'], outbound: 'proxy' }, null, 2)
    );

    await user.click(screen.getByRole('button', { name: /^Правило 2, / }));

    // Панель пересоздана и открылась на форме — вкладку выбираем заново.
    await user.click(within(await screen.findByRole('complementary')).getByRole('tab', { name: 'JSON' }));

    expect(await screen.findByRole('textbox', { name: 'Правило 2 текстом' })).toHaveValue(
      JSON.stringify({ port: 53, action: 'hijack-dns' }, null, 2)
    );
  });

  it('нераспознанный узел записывается в черновик: запрещать может только sing-box check', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: /^Правило 3, / }));

    const panel = await screen.findByRole('complementary');
    const editor = within(panel).getByRole('textbox', { name: 'Правило 3 текстом' });

    await user.clear(editor);
    await user.type(editor, '{{ "action": "quantum-teleport", "port": 443 }');
    await user.click(within(panel).getByRole('button', { name: 'Сохранить в черновик' }));

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

  it('отказ источника показывает причину и повтор, а не пустой список', async () => {
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

  it('конфиг без правил называет это, а не показывает пустое место', async () => {
    serveConfig(JSON.stringify({ outbounds: [{ type: 'direct', tag: 'direct' }] }));

    renderWithRouter(EditorPage);

    expect(await screen.findByText('Правил нет')).toBeInTheDocument();
  });
});

describe('правка списка правил', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    mockVirtualSizes();
    serveConfig(editConfig(EDIT_RULES));
  });

  it('добавляет правило в конец, ведёт его в route.final и открывает в панели', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: 'Добавить правило' }));

    expect(draftRules()).toEqual([...EDIT_RULES, { outbound: 'proxy' }]);

    const panel = await screen.findByRole('complementary', { name: 'Правило 4' });

    expect(within(panel).getByText('route.rules[3]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Правило 4, выход proxy, изменено в черновике' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('в конфиге без правил кнопка пустого состояния создаёт route.rules', async () => {
    serveConfig(JSON.stringify({ outbounds: [{ type: 'direct', tag: 'direct' }] }, null, 2));

    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    expect(await screen.findByText('Правил нет')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Добавить правило' }));

    expect(draftRules()).toEqual([{ outbound: 'direct' }]);
    expect(await screen.findByRole('table', { name: 'Правила маршрутизации' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Правило 1' })).toBeInTheDocument();
  });

  it('без аутбаундов и route.final новому правилу неоткуда взять выход — кнопка выключена и говорит почему', async () => {
    serveConfig('{}');

    renderWithRouter(EditorPage);

    expect(await screen.findByRole('button', { name: 'Добавить правило' })).toBeDisabled();
    expect(screen.getByText(/нет ни route\.final, ни аутбаунда/)).toBeInTheDocument();
  });

  it('добавление при активном поиске снимает отбор: новое правило видно в списке', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    const search = await screen.findByRole('textbox', { name: 'Поиск по правилам' });

    await user.type(search, 'github');

    expect(screen.getByRole('status')).toHaveTextContent('Показано 1 из 3');

    await user.click(screen.getByRole('button', { name: 'Добавить правило' }));

    expect(search).toHaveValue('');
    expect(screen.getByRole('status')).toHaveTextContent('4 правила');
    expect(
      await screen.findByRole('button', { name: 'Правило 4, выход proxy, изменено в черновике' })
    ).toBeInTheDocument();
  });

  it('удаление убирает узел и закрывает панель, а соседей не трогает', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: /^Правило 2, / }));
    await user.click(
      within(await screen.findByRole('complementary')).getByRole('button', { name: 'Удалить правило 2' })
    );

    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    // Файл без правила 2 — тот же текст, что был, строка в строку.
    expect(ConfigDocumentState.getState().draft).toBe(editConfig([EDIT_RULES[0], EDIT_RULES[2]]));
    expect(screen.getByRole('status')).toHaveTextContent('2 правила');
  });

  it('«Выше» переставляет правило, а панель остаётся на нём вместе с вкладкой и фокусом', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: /^Правило 3, / }));

    const panel = await screen.findByRole('complementary');

    await user.click(within(panel).getByRole('tab', { name: 'JSON' }));
    await user.click(within(panel).getByRole('button', { name: 'Поднять правило 3 выше' }));

    expect(draftRules()).toEqual([EDIT_RULES[0], EDIT_RULES[2], EDIT_RULES[1]]);
    expect(within(panel).getByRole('heading', { name: 'Правило 2' })).toBeInTheDocument();
    expect(within(panel).getByText('route.rules[1]')).toBeInTheDocument();
    // Панель не пересоздана: открытая вкладка осталась, а текст узла — тот же.
    expect(within(panel).getByRole('tab', { name: 'JSON' })).toHaveAttribute('aria-selected', 'true');
    expect(within(panel).getByRole('textbox', { name: 'Правило 2 текстом' })).toHaveValue(
      JSON.stringify(EDIT_RULES[2], null, 2)
    );
    expect(within(panel).getByRole('button', { name: 'Поднять правило 2 выше' })).toHaveFocus();
  });

  it('на первом месте «Выше» гаснет, и фокус уходит на «Ниже», а не теряется', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: /^Правило 2, / }));

    const panel = await screen.findByRole('complementary');

    await user.click(within(panel).getByRole('button', { name: 'Поднять правило 2 выше' }));

    expect(within(panel).getByRole('button', { name: 'Поднять правило 1 выше' })).toBeDisabled();
    expect(within(panel).getByRole('button', { name: 'Опустить правило 1 ниже' })).toHaveFocus();
  });

  it('переставленное правило сохраняет счёт срабатываний и не помечается изменённым', async () => {
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

describe('экран правил на узком экране', () => {
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

  it('открывает правило листом поверх списка, а не под ним', async () => {
    const user = userEvent.setup();

    renderWithRouter(EditorPage);

    await user.click(await screen.findByRole('button', { name: /^Правило 1, / }));

    const sheet = await screen.findByRole('dialog', { name: 'Правило 1' });

    expect(within(sheet).getByText('route.rules[0]')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});

describe('правка списка правил на узком экране', () => {
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

  it('лист остаётся на переставленном правиле и не пересоздаётся', async () => {
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

describe('тон выхода правила', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    mockVirtualSizes();
  });

  it('выход красится по типу аутбаунда, а не по имени тега', async () => {
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

    // Предмет теста — сам тон: по нему читается судьба трафика.
    expect(within(proxyRow).getByText('directional')).toHaveClass('text-route-proxy');
    expect(within(proxyRow).getByText('directional')).not.toHaveClass('text-route-direct');
    expect(within(directRow).getByText('direct')).toHaveClass('text-route-direct');
  });
});

describe('отбор по сету из адреса', () => {
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

  it('показывает только правила, которые ссылаются на сет', async () => {
    renderWithRuleSet('github');

    const table = await screen.findByRole('table', { name: 'Правила маршрутизации' });

    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(screen.getByRole('status')).toHaveTextContent('Показано 1 из 3');
  });

  it('снимается кнопкой отбора и уходит из адреса', async () => {
    const user = userEvent.setup();
    const { router } = renderWithRuleSet('github');

    await user.click(await screen.findByRole('button', { name: 'Снять отбор: сет github' }));

    expect(await screen.findByRole('status')).toHaveTextContent('3 правила');
    expect(router.state.location.search).toEqual({});
  });

  it('сет без правил даёт пустой отбор, а его сброс возвращает список', async () => {
    const user = userEvent.setup();

    renderWithRuleSet('geoip-ru');

    expect(await screen.findByText('Ничего не нашлось по этому запросу.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Сбросить отбор' }));

    expect(await screen.findByRole('status')).toHaveTextContent('3 правила');
  });
});

describe('номер правила из адреса', () => {
  it('переводит номер интерфейса в индекс узла', () => {
    expect(toSelectedRuleId(1)).toBe('0');
    expect(toSelectedRuleId(7)).toBe('6');
  });

  it('без номера в адресе не выбирает ничего', () => {
    expect(toSelectedRuleId(undefined)).toBeNull();
  });
});
