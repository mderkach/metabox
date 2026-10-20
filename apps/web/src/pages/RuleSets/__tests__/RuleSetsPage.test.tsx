import { renderWithRouter } from '@test/renderWithRouter';
import { server } from '@test/server';
import { finishSidePanelTransition } from '@test/sidePanel';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CONFIG_ENDPOINT, ConfigDocumentState, findValue } from '@entities/Config';
import { DAEMON_ENDPOINT } from '@entities/Daemon';
import { DAEMON_STATUS_FIXTURE } from '@entities/Daemon/__tests__/Daemon.fixture';
import { RULE_SET_ENDPOINT } from '@entities/RuleSet';
import { ruleSetHandlers } from '@entities/RuleSet/__tests__/RuleSet.handlers';
import { PANEL_AS_SHEET } from '@shared/lib/media';

import { RuleSetsPage } from '../ui/RuleSetsPage';

const CONFIG = JSON.stringify(
  {
    outbounds: [
      { type: 'direct', tag: 'direct' },
      { type: 'selector', tag: 'proxy', outbounds: ['direct'] },
    ],
    route: {
      rules: [{ rule_set: ['geosite-google'], outbound: 'proxy' }],
      rule_set: [
        {
          type: 'remote',
          tag: 'geosite-google',
          url: 'https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-google.srs',
          update_interval: '24h',
        },
        {
          type: 'remote',
          tag: 'geoip-ru',
          url: 'https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-ru.srs',
          update_interval: '12h',
        },
      ],
    },
    experimental: { cache_file: { enabled: true } },
  },
  null,
  2
);

/** A remote rule set without a cache: an unavailable provider aborts the sing-box start. */
const CONFIG_WITHOUT_CACHE = JSON.stringify(
  {
    outbounds: [{ type: 'direct', tag: 'direct' }],
    route: {
      rule_set: [
        {
          type: 'remote',
          tag: 'geoip-ru',
          url: 'https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-ru.srs',
        },
      ],
    },
  },
  null,
  2
);

/** Rule sets without a download: they do not need a cache, although there is none. */
const CONFIG_WITHOUT_REMOTE = JSON.stringify(
  {
    outbounds: [{ type: 'direct', tag: 'direct' }],
    route: {
      rule_set: [
        { type: 'inline', tag: 'my-list', rules: [{ domain: ['a.example'] }] },
        { type: 'local', tag: 'big-list', format: 'source', path: 'rule-sets/big-list.json' },
      ],
    },
  },
  null,
  2
);

const CACHE_NOTICE = 'Кэш сетов выключен';

/** The header is also a table row, so there is one more row than rule sets. */
const HEADER_ROWS = 1;

describe('rule sets screen', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    server.use(
      http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(CONFIG)),
      // The screen header opens the version history, and the apply bar polls the daemon.
      http.get(CONFIG_ENDPOINT.versions(), () => HttpResponse.json({ versions: [] })),
      http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json(DAEMON_STATUS_FIXTURE)),
      ...ruleSetHandlers
    );
  });

  it('the header names the list columns', async () => {
    renderWithRouter(RuleSetsPage);

    const table = await screen.findByRole('table', { name: 'Подключённые сеты' });

    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent)
    ).toEqual(['Сет', 'Источник', 'Использование', 'Действия над строкой']);
  });

  it('names the provider and list kind by the daemon catalog', async () => {
    renderWithRouter(RuleSetsPage);

    const table = await screen.findByRole('table', { name: 'Подключённые сеты' });
    const rows = within(table).getAllByRole('row').slice(HEADER_ROWS);

    expect(rows[0]).toHaveTextContent('v2fly·geosite·google');
    expect(rows[1]).toHaveTextContent('v2fly·geoip·ru');
  });

  // The catalog is needed for hints and labels, not for the list itself: without it the rule sets
  // are visible and removable.
  it('on a catalog failure shows the list and reports the failure', async () => {
    server.use(http.get(RULE_SET_ENDPOINT.catalog(), () => HttpResponse.json({}, { status: 500 })));

    renderWithRouter(RuleSetsPage);

    const table = await screen.findByRole('table', { name: 'Подключённые сеты' });

    expect(within(table).getAllByRole('row')).toHaveLength(HEADER_ROWS + 2);
    expect(screen.getByText('Не удалось получить каталог сетов')).toBeInTheDocument();
  });

  // The router owner is not obliged to read the raw `24h` from the config.
  it('prints the update interval in words', async () => {
    renderWithRouter(RuleSetsPage);

    expect(await screen.findByText('обновляется раз в сутки')).toBeInTheDocument();
    expect(screen.getByText('обновляется каждые 12 ч')).toBeInTheDocument();
  });

  it('the usage mark leads to the rules filtered by the rule set', async () => {
    renderWithRouter(RuleSetsPage);

    const table = await screen.findByRole('table', { name: 'Подключённые сеты' });

    expect(within(table).getByRole('link', { name: 'в 1 правиле' })).toHaveAttribute(
      'href',
      '/config?rule_set=geosite-google'
    );
    // An unused rule set is the one the link exists for: the next step
    // after connecting is to refer to it from a rule.
    expect(within(table).getByRole('link', { name: 'ни в одном правиле' })).toHaveAttribute(
      'href',
      '/config?rule_set=geoip-ru'
    );
  });

  it('removing a rule set requires confirmation and names the rules that refer to it', async () => {
    const user = userEvent.setup();

    renderWithRouter(RuleSetsPage);

    await user.click(await screen.findByRole('button', { name: 'Убрать сет geosite-google' }));

    const dialog = screen.getByRole('alertdialog', { name: 'Убрать сет geosite-google?' });

    expect(dialog).toHaveTextContent('Сет используется в 1 правиле');

    await user.click(within(dialog).getByRole('button', { name: 'Убрать' }));

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    expect(findValue(ConfigDocumentState.getState().draft ?? '', ['route', 'rule_set'])).toEqual([
      findValue(CONFIG, ['route', 'rule_set', 1]),
    ]);
  });

  it('cancelling the confirmation leaves the rule set in place', async () => {
    const user = userEvent.setup();

    renderWithRouter(RuleSetsPage);

    await user.click(await screen.findByRole('button', { name: 'Убрать сет geoip-ru' }));
    await user.click(
      within(screen.getByRole('alertdialog', { name: 'Убрать сет geoip-ru?' })).getByRole('button', { name: 'Отмена' })
    );

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    expect(ConfigDocumentState.getState().draft).toBeNull();
    expect(within(screen.getByRole('table', { name: 'Подключённые сеты' })).getAllByRole('row')).toHaveLength(
      HEADER_ROWS + 2
    );
  });

  it('search filters rows and is reset by the empty screen button', async () => {
    const user = userEvent.setup();

    renderWithRouter(RuleSetsPage);

    const table = await screen.findByRole('table', { name: 'Подключённые сеты' });

    expect(within(table).getAllByRole('row')).toHaveLength(2 + HEADER_ROWS);

    const search = screen.getByRole('textbox', { name: 'Поиск по сетам' });

    await user.type(search, 'geoip');

    expect(within(table).getAllByRole('row')).toHaveLength(1 + HEADER_ROWS);
    expect(within(table).getByText('geoip-ru')).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'нетакого');

    expect(screen.queryByRole('table', { name: 'Подключённые сеты' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Сбросить отбор' }));

    expect(await screen.findByRole('table', { name: 'Подключённые сеты' })).toBeInTheDocument();
  });
});

describe('rule set panel', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    server.use(
      http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(CONFIG)),
      http.get(CONFIG_ENDPOINT.versions(), () => HttpResponse.json({ versions: [] })),
      http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json(DAEMON_STATUS_FIXTURE)),
      ...ruleSetHandlers
    );
  });

  it('the toolbar button opens the form in a panel next to the list and moves focus to its heading', async () => {
    const user = userEvent.setup();

    renderWithRouter(RuleSetsPage);

    const table = await screen.findByRole('table', { name: 'Подключённые сеты' });
    const open = screen.getByRole('button', { name: 'Подключить сет' });

    await user.click(open);

    const panel = await screen.findByRole('complementary', { name: 'Новый сет' });

    expect(within(panel).getByRole('heading', { name: 'Новый сет' })).toHaveFocus();
    expect(within(panel).getByLabelText('Категория')).toBeInTheDocument();
    expect(open).toHaveAttribute('aria-expanded', 'true');
    // The form does not go into the list card: the rows stay in place.
    expect(within(table).queryByLabelText('Категория')).not.toBeInTheDocument();
  });

  it('Escape closes the panel and returns focus to the button that opened it', async () => {
    const user = userEvent.setup();

    renderWithRouter(RuleSetsPage);

    await screen.findByRole('table', { name: 'Подключённые сеты' });

    const open = screen.getByRole('button', { name: 'Свой список' });

    await user.click(open);
    await screen.findByRole('complementary', { name: 'Свой список доменов и адресов' });
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();

    finishSidePanelTransition();

    expect(open).toHaveFocus();
  });

  it('a custom list from the panel lands in the list, and the panel closes', async () => {
    const user = userEvent.setup();

    renderWithRouter(RuleSetsPage);

    const table = await screen.findByRole('table', { name: 'Подключённые сеты' });

    await user.click(screen.getByRole('button', { name: 'Свой список' }));

    const panel = await screen.findByRole('complementary', { name: 'Свой список доменов и адресов' });

    await user.type(within(panel).getByLabelText('Имя списка'), 'my-list');
    await user.click(within(panel).getByLabelText('Домены и адреса'));
    await user.paste('example.com');
    await user.click(within(panel).getByRole('button', { name: 'Сохранить в черновик' }));

    await waitFor(() => {
      expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    });
    expect(within(table).getAllByRole('row')).toHaveLength(3 + HEADER_ROWS);
    expect(within(table).getByText('my-list')).toBeInTheDocument();
  });
  it('the row pencil opens a rule set edit in the panel, the edit goes into the draft as typed', async () => {
    const user = userEvent.setup();

    renderWithRouter(RuleSetsPage);

    await screen.findByRole('table', { name: 'Подключённые сеты' });
    await user.click(screen.getByRole('button', { name: 'Изменить сет geoip-ru' }));

    const panel = await screen.findByRole('complementary', { name: 'Сет geoip-ru' });

    expect(within(panel).getByRole('heading', { name: 'Сет geoip-ru' })).toHaveFocus();
    expect(within(panel).getByLabelText('Имя сета')).toHaveValue('geoip-ru');

    await user.clear(within(panel).getByLabelText('Имя сета'));
    await user.type(within(panel).getByLabelText('Имя сета'), 'geoip-russia');

    expect(within(panel).getByLabelText('Имя сета')).toHaveFocus();
    await waitFor(() => {
      expect(findValue(ConfigDocumentState.getState().draft ?? '', ['route', 'rule_set', 1, 'tag'])).toBe(
        'geoip-russia'
      );
    });

    await user.click(within(panel).getByRole('button', { name: 'Готово' }));

    await waitFor(() => {
      expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    });
    expect(findValue(ConfigDocumentState.getState().draft ?? '', ['route', 'rule_set', 1, 'update_interval'])).toBe(
      '12h'
    );
  });
});

describe('rule set panel on a narrow screen', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    server.use(
      http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(CONFIG)),
      http.get(CONFIG_ENDPOINT.versions(), () => HttpResponse.json({ versions: [] })),
      http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json(DAEMON_STATUS_FIXTURE)),
      ...ruleSetHandlers
    );
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

  it('opens the form as a sheet over the list, not next to it', async () => {
    const user = userEvent.setup();

    renderWithRouter(RuleSetsPage);

    await screen.findByRole('table', { name: 'Подключённые сеты' });
    await user.click(screen.getByRole('button', { name: 'Подключить сет' }));

    const sheet = await screen.findByRole('dialog', { name: 'Новый сет' });

    expect(within(sheet).getByLabelText('Категория')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});

describe('rule set cache warning', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    server.use(
      http.get(CONFIG_ENDPOINT.versions(), () => HttpResponse.json({ versions: [] })),
      http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json(DAEMON_STATUS_FIXTURE)),
      ...ruleSetHandlers
    );
  });

  it('a remote rule set without experimental.cache_file: the button enables the cache in the draft, and the warning disappears', async () => {
    server.use(http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(CONFIG_WITHOUT_CACHE)));

    const user = userEvent.setup();

    renderWithRouter(RuleSetsPage);

    expect(await screen.findByText(CACHE_NOTICE)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Включить кэш' }));

    const draft = ConfigDocumentState.getState().draft ?? '';

    expect(findValue(draft, ['experimental'])).toEqual({ cache_file: { enabled: true } });
    // The section is appended to the file, not built anew: the rest is untouched.
    expect(findValue(draft, ['route'])).toEqual(findValue(CONFIG_WITHOUT_CACHE, ['route']));
    expect(findValue(draft, ['outbounds'])).toEqual(findValue(CONFIG_WITHOUT_CACHE, ['outbounds']));
    expect(screen.queryByText(CACHE_NOTICE)).not.toBeInTheDocument();
  });

  it('a document without remote rule sets shows no warning', async () => {
    server.use(http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(CONFIG_WITHOUT_REMOTE)));

    renderWithRouter(RuleSetsPage);

    const table = await screen.findByRole('table', { name: 'Подключённые сеты' });

    expect(within(table).getAllByRole('row')).toHaveLength(2 + HEADER_ROWS);
    expect(screen.queryByText(CACHE_NOTICE)).not.toBeInTheDocument();
  });
});
