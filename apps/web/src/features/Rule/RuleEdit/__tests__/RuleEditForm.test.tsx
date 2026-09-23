import { selectOption } from '@test/selectOption';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { ConfigDocumentState, findValue } from '@entities/Config';
import { RULE_TARGET, type RuleRow } from '@entities/Rule';

import { RuleEditForm } from '../ui/RuleEditForm';

const CONFIG = JSON.stringify(
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
    render(<RuleEditForm rule={RULE} outbounds={['direct', 'proxy']} />);

    expect(screen.getByRole('combobox', { name: 'Куда отправить' })).toHaveTextContent('proxy');
    expect(screen.getByRole('button', { name: 'Сохранить в черновик' })).toBeDisabled();
  });

  it('смена выхода правит одну строку файла, остальное правило не трогает', async () => {
    const user = userEvent.setup();

    render(<RuleEditForm rule={RULE} outbounds={['direct', 'proxy']} />);

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

    render(<RuleEditForm rule={RULE} outbounds={['direct', 'proxy']} />);

    await selectOption(user, screen.getByRole('combobox', { name: 'Что делать' }), 'оборвать');

    expect(screen.queryByRole('combobox', { name: 'Куда отправить' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Сохранить в черновик' }));

    expect(findValue(ConfigDocumentState.getState().draft ?? '', ['route', 'rules', 0])).toEqual({
      rule_set: ['github'],
      action: 'reject',
    });
  });
});
