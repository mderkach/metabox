import { selectOption } from '@test/selectOption';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { ConfigDocumentState, findValue, readRules } from '@entities/Config';
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

describe('форма выхода правила', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    ConfigDocumentState.getState().load(CONFIG);
  });

  it('открывается на значении из конфига и не даёт применить пустую правку', () => {
    render(<RuleEditForm rule={RULE} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    expect(screen.getByRole('combobox', { name: 'Куда отправить' })).toHaveTextContent('proxy');
    expect(screen.getByRole('button', { name: 'Сохранить в черновик' })).toBeDisabled();
  });

  it('смена выхода правит одну строку файла, остальное правило не трогает', async () => {
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

  it('смена действия на не-маршрутизацию убирает выход из узла, а не обнуляет его', async () => {
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

/** Документ с одним правилом: строка правила собирается тем же адаптером, что и в экране. */
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

describe('сеты правила в форме', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    ConfigDocumentState.getState().load(CONFIG);
  });

  it('открывается на сетах правила', () => {
    render(<RuleEditForm rule={RULE} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    expect(screen.getByRole('combobox', { name: 'Сеты правил' })).toHaveTextContent('github');
  });

  it('добавленный сет ложится в rule_set, остальное правило не тронуто', async () => {
    const user = userEvent.setup();

    render(<RuleEditForm rule={RULE} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    const sets = screen.getByRole('combobox', { name: 'Сеты правил' });

    await selectOption(user, sets, 'geoip-cn');
    await user.keyboard('{Escape}');

    expect(sets).toHaveTextContent('github, geoip-cn');

    await user.click(screen.getByRole('button', { name: 'Сохранить в черновик' }));

    expect(draftRule()).toEqual({ rule_set: ['github', 'geoip-cn'], outbound: 'proxy' });
  });

  it('снятие всех сетов удаляет поле из узла, а не пишет пустой список', async () => {
    const user = userEvent.setup();

    render(<RuleEditForm rule={RULE} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    await selectOption(user, screen.getByRole('combobox', { name: 'Сеты правил' }), 'github');
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Сохранить в черновик' }));

    expect(draftRule()).toEqual({ outbound: 'proxy' });
  });

  it('правка выхода не переписывает rule_set, записанный строкой', async () => {
    const user = userEvent.setup();
    const rule = loadRule({ rule_set: 'github', outbound: 'proxy' });

    render(<RuleEditForm rule={rule} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    expect(screen.getByRole('combobox', { name: 'Сеты правил' })).toHaveTextContent('github');

    await selectOption(user, screen.getByRole('combobox', { name: 'Куда отправить' }), 'direct');
    await user.click(screen.getByRole('button', { name: 'Сохранить в черновик' }));

    expect(draftRule()).toEqual({ rule_set: 'github', outbound: 'direct' });
  });

  it('у логического правила поля сетов нет: его сеты живут во вложенных правилах', () => {
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

  it('сет, которого нет в документе, остаётся выбранным и помечен', async () => {
    const user = userEvent.setup();
    const rule = loadRule({ rule_set: ['old-set'], outbound: 'proxy' });

    render(<RuleEditForm rule={rule} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    const sets = screen.getByRole('combobox', { name: 'Сеты правил' });

    expect(sets).toHaveTextContent('old-set');

    await selectOption(user, sets, 'github');

    expect(screen.getByRole('option', { name: /old-set/ })).toHaveTextContent('old-setнет в документе');
    expect(screen.getByRole('option', { name: 'github' })).not.toHaveTextContent('нет в документе');
  });

  it('предупреждает, что правило без сетов и других условий заберёт весь трафик, но сохранять не мешает', async () => {
    const user = userEvent.setup();

    render(<RuleEditForm rule={RULE} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    await selectOption(user, screen.getByRole('combobox', { name: 'Сеты правил' }), 'github');
    await user.keyboard('{Escape}');

    expect(screen.getByRole('status')).toHaveTextContent('заберёт весь трафик');
    expect(screen.getByRole('button', { name: 'Сохранить в черновик' })).toBeEnabled();
  });

  it('у правила с другими условиями снятие сетов не предупреждает', async () => {
    const user = userEvent.setup();
    const rule = loadRule({ rule_set: ['github'], port: 443, outbound: 'proxy' });

    render(<RuleEditForm rule={rule} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    await selectOption(user, screen.getByRole('combobox', { name: 'Сеты правил' }), 'github');
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('условия правила в форме', () => {
  it('добавленное условие ложится в узел списком, остальное правило не трогает', async () => {
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

  it('открывается на условиях правила, а очищенное условие убирает поле', async () => {
    const user = userEvent.setup();
    const rule = loadRule({ domain: ['a.example'], port: [443], outbound: 'proxy' });

    render(<RuleEditForm rule={rule} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    expect(screen.getByRole('textbox', { name: 'Порт' })).toHaveValue('443');

    await user.clear(screen.getByRole('textbox', { name: 'Домен' }));
    await user.click(screen.getByRole('button', { name: 'Сохранить в черновик' }));

    expect(draftRule()).toEqual({ port: [443], outbound: 'proxy' });
  });

  it('порт не числом называет ошибку и не пишет правку', async () => {
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

  it('сняв все условия, предупреждает, что правило заберёт весь трафик', async () => {
    const user = userEvent.setup();
    const rule = loadRule({ domain: ['a.example'], outbound: 'proxy' });

    render(<RuleEditForm rule={rule} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    await user.clear(screen.getByRole('textbox', { name: 'Домен' }));

    expect(screen.getByRole('status')).toHaveTextContent('заберёт весь трафик');
  });
});
