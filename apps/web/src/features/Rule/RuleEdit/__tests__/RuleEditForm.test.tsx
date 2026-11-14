import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderWithQuery } from '@test/renderWithQuery';
import { selectOption } from '@test/selectOption';
import { server } from '@test/server';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { ConfigDocumentState, findValue, readRuleNames, readRules } from '@entities/Config';
import { createDeviceHandlers } from '@entities/Device/__tests__/Device.handlers';
import { RULE_TARGET, toRuleRowsFromNodes, type RuleRow } from '@entities/Rule';

import { RuleEditForm } from '../ui/RuleEditForm';

const DOCUMENT = {
  outbounds: [
    { type: 'direct', tag: 'direct' },
    { type: 'selector', tag: 'proxy', outbounds: ['direct'] },
  ],
  route: {
    rules: [{ rule_set: ['github'], outbound: 'proxy' }],
    rule_set: [
      { type: 'remote', tag: 'github', format: 'binary', url: 'https://example.invalid/github.srs' },
      { type: 'remote', tag: 'geoip-cn', format: 'binary', url: 'https://example.invalid/geoip-cn.srs' },
    ],
  },
};

const CONFIG = JSON.stringify(DOCUMENT, null, 2);

const RULE_SETS = ['github', 'geoip-cn'];

const RULE: RuleRow = {
  id: '0',
  index: 1,
  name: null,
  matchers: [{ key: 'rule_set', values: ['github'] }],
  group: null,
  invert: false,
  target: 'proxy',
  targetKind: RULE_TARGET.Outbound,
  targetDetail: null,
  isCatchAll: false,
  recognized: true,
  searchText: 'rule_set github proxy',
};

describe('rule outbound form', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    ConfigDocumentState.getState().load(CONFIG);
  });

  it('opens on the value from the config and writes nothing until a change', () => {
    renderWithQuery(<RuleEditForm rule={RULE} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    expect(screen.getByRole('combobox', { name: 'Куда отправить' })).toHaveTextContent('proxy');
    expect(ConfigDocumentState.getState().draft).toBeNull();
  });

  it('an outbound change edits one line of the file, does not touch the rest of the rule', async () => {
    const user = userEvent.setup();

    renderWithQuery(<RuleEditForm rule={RULE} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    const outbound = screen.getByRole('combobox', { name: 'Куда отправить' });

    await selectOption(user, outbound, 'direct');

    expect(outbound).toHaveTextContent('direct');

    expect(findValue(ConfigDocumentState.getState().draft ?? '', ['route', 'rules', 0])).toEqual({
      rule_set: ['github'],
      outbound: 'direct',
    });
  });

  it('changing the action to non-routing removes the outbound from the node instead of zeroing it', async () => {
    const user = userEvent.setup();

    renderWithQuery(<RuleEditForm rule={RULE} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    await selectOption(user, screen.getByRole('combobox', { name: 'Что делать' }), 'оборвать');

    expect(screen.queryByRole('combobox', { name: 'Куда отправить' })).not.toBeInTheDocument();

    expect(findValue(ConfigDocumentState.getState().draft ?? '', ['route', 'rules', 0])).toEqual({
      rule_set: ['github'],
      action: 'reject',
    });
  });
});

describe('rule action change', () => {
  it('removes the fields of the previous action: the schema branch of the new one does not have them', async () => {
    const user = userEvent.setup();
    const rule = loadRule({ rule_set: ['github'], action: 'reject', method: 'drop' });

    renderWithQuery(<RuleEditForm rule={rule} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    await selectOption(user, screen.getByRole('combobox', { name: 'Что делать' }), 'направить через выход');
    await selectOption(user, screen.getByRole('combobox', { name: 'Куда отправить' }), 'proxy');

    expect(draftRule()).toEqual({ rule_set: ['github'], action: 'route', outbound: 'proxy' });
  });

  it('removes the sniffing fields when sniffing turns into rejecting', async () => {
    const user = userEvent.setup();
    const rule = loadRule({ rule_set: ['github'], action: 'sniff', sniffer: ['tls'], timeout: '1s' });

    renderWithQuery(<RuleEditForm rule={rule} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    await selectOption(user, screen.getByRole('combobox', { name: 'Что делать' }), 'оборвать');

    expect(draftRule()).toEqual({ rule_set: ['github'], action: 'reject' });
  });

  it('removes the routing fields when routing turns into another action', async () => {
    const user = userEvent.setup();
    const rule = loadRule({ rule_set: ['github'], outbound: 'proxy', override_port: 53 });

    renderWithQuery(<RuleEditForm rule={rule} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    await selectOption(user, screen.getByRole('combobox', { name: 'Что делать' }), 'оборвать');

    expect(draftRule()).toEqual({ rule_set: ['github'], action: 'reject' });
  });
});

/** A document with one rule: the rule row is built by the same adapter as on the screen. */
function loadRule(rule: object): RuleRow {
  const text = JSON.stringify({ ...DOCUMENT, route: { ...DOCUMENT.route, rules: [rule] } }, null, 2);

  ConfigDocumentState.getState().reset();
  ConfigDocumentState.getState().load(text);

  const row = toRuleRowsFromNodes(readRules(text)).at(0);

  if (row === undefined) {
    throw new Error('Правило не разобралось');
  }

  return row;
}

function draftRule(): unknown {
  return findValue(ConfigDocumentState.getState().draft ?? '', ['route', 'rules', 0]);
}

describe('rule sets of a rule in the form', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    ConfigDocumentState.getState().load(CONFIG);
  });

  it('opens on the rule sets of the rule', () => {
    renderWithQuery(<RuleEditForm rule={RULE} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    expect(screen.getByRole('combobox', { name: 'Сеты правил' })).toHaveTextContent('github');
  });

  it('an added rule set lands in rule_set, the rest of the rule is untouched', async () => {
    const user = userEvent.setup();

    renderWithQuery(<RuleEditForm rule={RULE} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    const sets = screen.getByRole('combobox', { name: 'Сеты правил' });

    await selectOption(user, sets, 'geoip-cn');
    await user.keyboard('{Escape}');

    expect(sets).toHaveTextContent('github, geoip-cn');

    expect(draftRule()).toEqual({ rule_set: ['github', 'geoip-cn'], outbound: 'proxy' });
  });

  it('removing all rule sets deletes the field from the node instead of writing an empty list', async () => {
    const user = userEvent.setup();

    renderWithQuery(<RuleEditForm rule={RULE} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    await selectOption(user, screen.getByRole('combobox', { name: 'Сеты правил' }), 'github');
    await user.keyboard('{Escape}');

    expect(draftRule()).toEqual({ outbound: 'proxy' });
  });

  it('an outbound edit does not rewrite rule_set written as a string', async () => {
    const user = userEvent.setup();
    const rule = loadRule({ rule_set: 'github', outbound: 'proxy' });

    renderWithQuery(<RuleEditForm rule={rule} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    expect(screen.getByRole('combobox', { name: 'Сеты правил' })).toHaveTextContent('github');

    await selectOption(user, screen.getByRole('combobox', { name: 'Куда отправить' }), 'direct');

    expect(draftRule()).toEqual({ rule_set: 'github', outbound: 'direct' });
  });

  it('a logical rule has no rule set field: its rule sets live in nested rules', () => {
    const rule = loadRule({
      type: 'logical',
      mode: 'and',
      rules: [{ rule_set: ['github'] }, { port: 443 }],
      outbound: 'proxy',
    });

    renderWithQuery(<RuleEditForm rule={rule} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    expect(screen.getByRole('combobox', { name: 'Куда отправить' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Сеты правил' })).not.toBeInTheDocument();
  });

  it('a rule set that is not in the document stays selected and is marked', async () => {
    const user = userEvent.setup();
    const rule = loadRule({ rule_set: ['old-set'], outbound: 'proxy' });

    renderWithQuery(<RuleEditForm rule={rule} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    const sets = screen.getByRole('combobox', { name: 'Сеты правил' });

    expect(sets).toHaveTextContent('old-set');

    await selectOption(user, sets, 'github');

    expect(screen.getByRole('option', { name: /old-set/ })).toHaveTextContent('old-setнет в документе');
    expect(screen.getByRole('option', { name: 'github' })).not.toHaveTextContent('нет в документе');
  });

  it('warns that a rule without rule sets and other conditions takes all traffic, but still writes it', async () => {
    const user = userEvent.setup();

    renderWithQuery(<RuleEditForm rule={RULE} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    await selectOption(user, screen.getByRole('combobox', { name: 'Сеты правил' }), 'github');
    await user.keyboard('{Escape}');

    expect(screen.getByRole('status')).toHaveTextContent('заберёт весь трафик');
    await waitFor(() => {
      expect(draftRule()).toEqual({ outbound: 'proxy' });
    });
  });

  it('for a rule with other conditions removing rule sets gives no warning', async () => {
    const user = userEvent.setup();
    const rule = loadRule({ rule_set: ['github'], port: 443, outbound: 'proxy' });

    renderWithQuery(<RuleEditForm rule={rule} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    await selectOption(user, screen.getByRole('combobox', { name: 'Сеты правил' }), 'github');
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('rule conditions in the form', () => {
  it('moves focus into a condition picked from the list', async () => {
    const user = userEvent.setup();
    const rule = loadRule({ rule_set: ['github'], outbound: 'proxy' });

    renderWithQuery(<RuleEditForm rule={rule} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    await selectOption(user, screen.getByRole('combobox', { name: 'Добавить условие' }), 'Домен с поддоменами');

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Домен с поддоменами' })).toHaveFocus();
    });
  });

  it('an added condition lands in the node as a list, does not touch the rest of the rule', async () => {
    const user = userEvent.setup();
    const rule = loadRule({ rule_set: ['github'], outbound: 'proxy' });

    renderWithQuery(<RuleEditForm rule={rule} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    await selectOption(user, screen.getByRole('combobox', { name: 'Добавить условие' }), 'Домен с поддоменами');
    await user.type(screen.getByRole('textbox', { name: 'Домен с поддоменами' }), 'youtube.com{Enter}googlevideo.com');

    expect(draftRule()).toEqual({
      rule_set: ['github'],
      outbound: 'proxy',
      domain_suffix: ['youtube.com', 'googlevideo.com'],
    });
  });

  it('opens on the rule conditions, and a cleared condition removes the field', async () => {
    const user = userEvent.setup();
    const rule = loadRule({ domain: ['a.example'], port: [443], outbound: 'proxy' });

    renderWithQuery(<RuleEditForm rule={rule} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    expect(within(screen.getByRole('list', { name: 'Порт: значения' })).getByText('443')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Убрать a.example' }));
    // An emptied field leaves the node when it is left, not while it is being typed in.
    await user.tab();

    await waitFor(() => {
      expect(draftRule()).toEqual({ port: [443], outbound: 'proxy' });
    });
  });

  it('a port that is not a number gives an error and writes no edit', async () => {
    const user = userEvent.setup();
    const rule = loadRule({ port: [443], outbound: 'proxy' });

    renderWithQuery(<RuleEditForm rule={rule} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    await user.type(screen.getByRole('combobox', { name: 'Порт' }), 'https');

    expect(await screen.findByRole('alert')).toHaveTextContent('Порт — число от 0 до 65535');

    expect(ConfigDocumentState.getState().draft).toBeNull();
  });

  it('marks a value that is not an address and names the error under the field', async () => {
    const user = userEvent.setup();
    const rule = loadRule({ ip_cidr: ['10.0.0.0/8'], outbound: 'proxy' });

    renderWithQuery(<RuleEditForm rule={rule} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    await user.type(screen.getByRole('combobox', { name: 'IP или подсеть' }), 'example.com ');

    const [subnet, word] = within(screen.getByRole('list', { name: 'IP или подсеть: значения' })).getAllByRole(
      'listitem'
    );

    expect(subnet).not.toHaveTextContent('ошибка');
    expect(word).toHaveTextContent('example.com, ошибка');
    expect(await screen.findByRole('alert')).toHaveTextContent('Адрес — это IP или подсеть');
    expect(ConfigDocumentState.getState().draft).toBeNull();
  });

  it('after removing all conditions, warns that the rule will take all traffic', async () => {
    const user = userEvent.setup();
    const rule = loadRule({ domain: ['a.example'], outbound: 'proxy' });

    renderWithQuery(<RuleEditForm rule={rule} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    await user.click(screen.getByRole('button', { name: 'Убрать a.example' }));

    expect(screen.getByRole('status')).toHaveTextContent('заберёт весь трафик');
  });

  it('a device from the list lands in the condition as a source address and warns about a dynamic lease', async () => {
    ConfigDocumentState.getState().reset();
    ConfigDocumentState.getState().load(CONFIG);
    server.use(...createDeviceHandlers());
    const user = userEvent.setup();

    renderWithQuery(<RuleEditForm rule={RULE} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    await selectOption(
      user,
      screen.getByRole('combobox', { name: 'Добавить условие' }),
      'Устройство или адрес источника'
    );
    await selectOption(
      user,
      await screen.findByRole('combobox', { name: 'Выбрать устройство' }),
      'iphone-guest · 192.168.1.120'
    );

    expect(
      within(screen.getByRole('list', { name: 'Устройство или адрес источника: значения' })).getByRole('listitem')
    ).toHaveTextContent('iphone-guest 192.168.1.120/32');
    expect(screen.getByRole('list', { name: 'Устройства с динамической арендой' })).toHaveTextContent(
      'iphone-guest: аренда динамическая, адрес может смениться'
    );

    expect(draftRule()).toEqual({ rule_set: ['github'], outbound: 'proxy', source_ip_cidr: ['192.168.1.120/32'] });
  });

  it('for a device with a static lease does not warn about an address change', async () => {
    server.use(...createDeviceHandlers());
    const user = userEvent.setup();

    renderWithQuery(<RuleEditForm rule={RULE} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    await selectOption(
      user,
      screen.getByRole('combobox', { name: 'Добавить условие' }),
      'Устройство или адрес источника'
    );
    await selectOption(
      user,
      await screen.findByRole('combobox', { name: 'Выбрать устройство' }),
      'Ноутбук · 192.168.1.60'
    );

    expect(
      within(screen.getByRole('list', { name: 'Устройство или адрес источника: значения' })).getByRole('listitem')
    ).toHaveTextContent('Ноутбук 192.168.1.60/32');
    expect(screen.queryByRole('list', { name: 'Устройства с динамической арендой' })).not.toBeInTheDocument();
  });
});

it('reveals a condition added through an external JSON edit without remounting', async () => {
  const rule = loadRule({ rule_set: ['github'], outbound: 'proxy' });
  server.use(...createDeviceHandlers());
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { rerender } = render(
    <QueryClientProvider client={client}>
      <RuleEditForm rule={rule} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />
    </QueryClientProvider>
  );
  const changed = toRuleRowsFromNodes([
    { rule_set: ['github'], outbound: 'proxy', domain_suffix: ['added.example'] },
  ]).at(0);

  if (changed === undefined) throw new Error('Missing changed rule');
  rerender(
    <QueryClientProvider client={client}>
      <RuleEditForm rule={changed} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />
    </QueryClientProvider>
  );

  expect(await screen.findByRole('textbox', { name: 'Домен с поддоменами' })).toBeInTheDocument();
  expect(screen.getByRole('list', { name: 'Домен с поддоменами: значения' })).toHaveTextContent('added.example');
});

it('takes a JSON edit of an outbound changed in the form earlier once focus left the form', async () => {
  const user = userEvent.setup();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  server.use(...createDeviceHandlers());

  /** As on the screen: the form gets its rule from the current document after every write. */
  function FormFromDraft() {
    const rule = toRuleRowsFromNodes([draftRule() ?? DOCUMENT.route.rules[0]]).at(0);

    return rule === undefined ? null : (
      <RuleEditForm rule={rule} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />
    );
  }

  loadRule({ rule_set: ['github'], outbound: 'proxy' });

  const { rerender } = render(
    <QueryClientProvider client={client}>
      <FormFromDraft />
    </QueryClientProvider>
  );
  const redraw = () => {
    rerender(
      <QueryClientProvider client={client}>
        <FormFromDraft />
      </QueryClientProvider>
    );
  };
  const outbound = screen.getByRole('combobox', { name: 'Куда отправить' });

  await selectOption(user, outbound, 'direct');
  redraw();
  // A browser returns focus to the trigger when the popup closes; jsdom leaves it in the popup.
  act(() => {
    outbound.focus();
  });
  await user.click(document.body);

  act(() => {
    ConfigDocumentState.getState().edit(['route', 'rules', 0, 'outbound'], 'proxy');
  });
  redraw();

  await waitFor(() => {
    expect(outbound).toHaveTextContent('proxy');
  });

  await user.type(screen.getByRole('textbox', { name: 'Имя' }), 'Work');

  await waitFor(() => {
    expect(readRuleNames(ConfigDocumentState.getState().draft ?? '')).toEqual(['Work']);
  });
  expect(draftRule()).toEqual({ rule_set: ['github'], outbound: 'proxy' });
});
