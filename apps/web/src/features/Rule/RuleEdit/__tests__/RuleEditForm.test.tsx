import { renderWithQuery } from '@test/renderWithQuery';
import { selectOption } from '@test/selectOption';
import { server } from '@test/server';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { ConfigDocumentState, findValue, readRules } from '@entities/Config';
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

  it('opens on the value from the config and does not let apply an empty edit', () => {
    render(<RuleEditForm rule={RULE} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    expect(screen.getByRole('combobox', { name: 'Куда отправить' })).toHaveTextContent('proxy');
    expect(screen.getByRole('button', { name: 'Сохранить в черновик' })).toBeDisabled();
  });

  it('an outbound change edits one line of the file, does not touch the rest of the rule', async () => {
    const user = userEvent.setup();

    render(<RuleEditForm rule={RULE} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    const outbound = screen.getByRole('combobox', { name: 'Куда отправить' });

    await selectOption(user, outbound, 'direct');

    expect(outbound).toHaveTextContent('direct');

    await user.click(screen.getByRole('button', { name: 'Сохранить в черновик' }));

    expect(findValue(ConfigDocumentState.getState().draft ?? '', ['route', 'rules', 0])).toEqual({
      rule_set: ['github'],
      outbound: 'direct',
    });
  });

  it('changing the action to non-routing removes the outbound from the node instead of zeroing it', async () => {
    const user = userEvent.setup();

    render(<RuleEditForm rule={RULE} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    await selectOption(user, screen.getByRole('combobox', { name: 'Что делать' }), 'оборвать');

    expect(screen.queryByRole('combobox', { name: 'Куда отправить' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Сохранить в черновик' }));

    expect(findValue(ConfigDocumentState.getState().draft ?? '', ['route', 'rules', 0])).toEqual({
      rule_set: ['github'],
      action: 'reject',
    });
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
    render(<RuleEditForm rule={RULE} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    expect(screen.getByRole('combobox', { name: 'Сеты правил' })).toHaveTextContent('github');
  });

  it('an added rule set lands in rule_set, the rest of the rule is untouched', async () => {
    const user = userEvent.setup();

    render(<RuleEditForm rule={RULE} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    const sets = screen.getByRole('combobox', { name: 'Сеты правил' });

    await selectOption(user, sets, 'geoip-cn');
    await user.keyboard('{Escape}');

    expect(sets).toHaveTextContent('github, geoip-cn');

    await user.click(screen.getByRole('button', { name: 'Сохранить в черновик' }));

    expect(draftRule()).toEqual({ rule_set: ['github', 'geoip-cn'], outbound: 'proxy' });
  });

  it('removing all rule sets deletes the field from the node instead of writing an empty list', async () => {
    const user = userEvent.setup();

    render(<RuleEditForm rule={RULE} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    await selectOption(user, screen.getByRole('combobox', { name: 'Сеты правил' }), 'github');
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Сохранить в черновик' }));

    expect(draftRule()).toEqual({ outbound: 'proxy' });
  });

  it('an outbound edit does not rewrite rule_set written as a string', async () => {
    const user = userEvent.setup();
    const rule = loadRule({ rule_set: 'github', outbound: 'proxy' });

    render(<RuleEditForm rule={rule} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    expect(screen.getByRole('combobox', { name: 'Сеты правил' })).toHaveTextContent('github');

    await selectOption(user, screen.getByRole('combobox', { name: 'Куда отправить' }), 'direct');
    await user.click(screen.getByRole('button', { name: 'Сохранить в черновик' }));

    expect(draftRule()).toEqual({ rule_set: 'github', outbound: 'direct' });
  });

  it('a logical rule has no rule set field: its rule sets live in nested rules', () => {
    const rule = loadRule({
      type: 'logical',
      mode: 'and',
      rules: [{ rule_set: ['github'] }, { port: 443 }],
      outbound: 'proxy',
    });

    render(<RuleEditForm rule={rule} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    expect(screen.getByRole('combobox', { name: 'Куда отправить' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Сеты правил' })).not.toBeInTheDocument();
  });

  it('a rule set that is not in the document stays selected and is marked', async () => {
    const user = userEvent.setup();
    const rule = loadRule({ rule_set: ['old-set'], outbound: 'proxy' });

    render(<RuleEditForm rule={rule} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    const sets = screen.getByRole('combobox', { name: 'Сеты правил' });

    expect(sets).toHaveTextContent('old-set');

    await selectOption(user, sets, 'github');

    expect(screen.getByRole('option', { name: /old-set/ })).toHaveTextContent('old-setнет в документе');
    expect(screen.getByRole('option', { name: 'github' })).not.toHaveTextContent('нет в документе');
  });

  it('warns that a rule without rule sets and other conditions takes all traffic, but does not block saving', async () => {
    const user = userEvent.setup();

    render(<RuleEditForm rule={RULE} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    await selectOption(user, screen.getByRole('combobox', { name: 'Сеты правил' }), 'github');
    await user.keyboard('{Escape}');

    expect(screen.getByRole('status')).toHaveTextContent('заберёт весь трафик');
    expect(screen.getByRole('button', { name: 'Сохранить в черновик' })).toBeEnabled();
  });

  it('for a rule with other conditions removing rule sets gives no warning', async () => {
    const user = userEvent.setup();
    const rule = loadRule({ rule_set: ['github'], port: 443, outbound: 'proxy' });

    render(<RuleEditForm rule={rule} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    await selectOption(user, screen.getByRole('combobox', { name: 'Сеты правил' }), 'github');
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('rule conditions in the form', () => {
  it('an added condition lands in the node as a list, does not touch the rest of the rule', async () => {
    const user = userEvent.setup();
    const rule = loadRule({ rule_set: ['github'], outbound: 'proxy' });

    render(<RuleEditForm rule={rule} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    await selectOption(user, screen.getByRole('combobox', { name: 'Добавить условие' }), 'Домен с поддоменами');
    await user.type(screen.getByRole('textbox', { name: 'Домен с поддоменами' }), 'youtube.com{Enter}googlevideo.com');
    await user.click(screen.getByRole('button', { name: 'Сохранить в черновик' }));

    expect(draftRule()).toEqual({
      rule_set: ['github'],
      outbound: 'proxy',
      domain_suffix: ['youtube.com', 'googlevideo.com'],
    });
  });

  it('opens on the rule conditions, and a cleared condition removes the field', async () => {
    const user = userEvent.setup();
    const rule = loadRule({ domain: ['a.example'], port: [443], outbound: 'proxy' });

    render(<RuleEditForm rule={rule} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    expect(screen.getByRole('textbox', { name: 'Порт' })).toHaveValue('443');

    await user.clear(screen.getByRole('textbox', { name: 'Домен' }));
    await user.click(screen.getByRole('button', { name: 'Сохранить в черновик' }));

    expect(draftRule()).toEqual({ port: [443], outbound: 'proxy' });
  });

  it('a port that is not a number gives an error and writes no edit', async () => {
    const user = userEvent.setup();
    const rule = loadRule({ port: [443], outbound: 'proxy' });

    render(<RuleEditForm rule={rule} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    const port = screen.getByRole('textbox', { name: 'Порт' });

    await user.clear(port);
    await user.type(port, 'https');

    expect(await screen.findByRole('alert')).toHaveTextContent('Порт — число от 0 до 65535 на строку');

    await user.click(screen.getByRole('button', { name: 'Сохранить в черновик' }));

    expect(ConfigDocumentState.getState().draft).toBeNull();
  });

  it('after removing all conditions, warns that the rule will take all traffic', async () => {
    const user = userEvent.setup();
    const rule = loadRule({ domain: ['a.example'], outbound: 'proxy' });

    render(<RuleEditForm rule={rule} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    await user.clear(screen.getByRole('textbox', { name: 'Домен' }));

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

    expect(screen.getByRole('textbox', { name: 'Устройство или адрес источника' })).toHaveValue('192.168.1.120/32');

    const chosen = screen.getByRole('list', { name: 'Устройства в условии' });

    expect(within(chosen).getByText('iphone-guest')).toBeInTheDocument();
    expect(within(chosen).getByText('Аренда динамическая, адрес может смениться')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Сохранить в черновик' }));

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

    const chosen = screen.getByRole('list', { name: 'Устройства в условии' });

    expect(within(chosen).getByText('Ноутбук')).toBeInTheDocument();
    expect(within(chosen).queryByText('Аренда динамическая, адрес может смениться')).not.toBeInTheDocument();
  });
});
