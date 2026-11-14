import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderWithQuery } from '@test/renderWithQuery';
import { server } from '@test/server';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { ConfigDocumentState } from '@entities/Config';
import { createDeviceHandlers } from '@entities/Device/__tests__/Device.handlers';
import { toRuleRowsFromNodes } from '@entities/Rule';

import { RuleEditForm } from '../ui/RuleEditForm';
import { CONFIG, draftRule, loadRule, RULE, RULE_SETS } from './RuleEditForm.fixture';

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
});

describe('rule sets of a rule in the form', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    ConfigDocumentState.getState().load(CONFIG);
  });

  it('opens on the rule sets of the rule', () => {
    renderWithQuery(<RuleEditForm rule={RULE} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    expect(screen.getByRole('combobox', { name: 'Сеты правил' })).toHaveTextContent('github');
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
});

describe('rule conditions in the form', () => {
  it('opens on the rule conditions, and a cleared condition removes the field', async () => {
    const user = userEvent.setup();
    const rule = loadRule({
      domain: ['a.example'],
      port: [443],
      outbound: 'proxy',
    });

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

    await user.type(screen.getByRole('textbox', { name: 'Порт' }), 'https');

    expect(await screen.findByRole('alert')).toHaveTextContent('Порт — число от 0 до 65535');

    expect(ConfigDocumentState.getState().draft).toBeNull();
  });

  it('marks a value that is not an address and names the error under the field', async () => {
    const user = userEvent.setup();
    const rule = loadRule({ ip_cidr: ['10.0.0.0/8'], outbound: 'proxy' });

    renderWithQuery(<RuleEditForm rule={rule} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    await user.type(screen.getByRole('textbox', { name: 'IP или подсеть' }), 'example.com ');

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
});

it('reveals a condition added through an external JSON edit without remounting', async () => {
  const rule = loadRule({ rule_set: ['github'], outbound: 'proxy' });
  server.use(...createDeviceHandlers());
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const { rerender } = render(
    <QueryClientProvider client={client}>
      <RuleEditForm rule={rule} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />
    </QueryClientProvider>
  );
  const changed = toRuleRowsFromNodes([
    {
      rule_set: ['github'],
      outbound: 'proxy',
      domain_suffix: ['added.example'],
    },
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
