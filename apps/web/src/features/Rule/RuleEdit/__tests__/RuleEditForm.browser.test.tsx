import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { worker } from '@test/browserWorker';
import { renderWithQuery } from '@test/renderWithQuery';
import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';

import { ConfigDocumentState, findValue, readRuleNames } from '@entities/Config';
import { createDeviceHandlers } from '@entities/Device/__tests__/Device.handlers';
import { toRuleRowsFromNodes } from '@entities/Rule';

import { RuleEditForm } from '../ui/RuleEditForm';
import { CONFIG, DOCUMENT, draftRule, loadRule, RULE, RULE_SETS } from './RuleEditForm.fixture';

/** Opens a dropdown and picks an option with the mouse. */
async function pick(trigger: HTMLElement, name: string): Promise<void> {
  await userEvent.click(trigger);
  await userEvent.click(await screen.findByRole('option', { name }));
}

describe('rule edit form picked with the mouse', () => {
  beforeEach(() => {
    worker.use(...createDeviceHandlers());
    ConfigDocumentState.getState().reset();
    ConfigDocumentState.getState().load(CONFIG);
  });

  it('an outbound change edits one line of the file, does not touch the rest of the rule', async () => {
    renderWithQuery(<RuleEditForm rule={RULE} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    const outbound = screen.getByRole('combobox', { name: 'Куда отправить' });

    await pick(outbound, 'direct');

    expect(within(outbound).getByText('direct')).toBeVisible();

    expect(findValue(ConfigDocumentState.getState().draft ?? '', ['route', 'rules', 0])).toEqual({
      rule_set: ['github'],
      outbound: 'direct',
    });
  });

  it('changing the action to non-routing removes the outbound from the node instead of zeroing it', async () => {
    renderWithQuery(<RuleEditForm rule={RULE} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    await pick(screen.getByRole('combobox', { name: 'Что делать' }), 'оборвать');

    expect(screen.queryByRole('combobox', { name: 'Куда отправить' })).not.toBeInTheDocument();

    expect(findValue(ConfigDocumentState.getState().draft ?? '', ['route', 'rules', 0])).toEqual({
      rule_set: ['github'],
      action: 'reject',
    });
  });

  it('removes the fields of the previous action: the schema branch of the new one does not have them', async () => {
    const rule = loadRule({
      rule_set: ['github'],
      action: 'reject',
      method: 'drop',
    });

    renderWithQuery(<RuleEditForm rule={rule} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    await pick(screen.getByRole('combobox', { name: 'Что делать' }), 'направить через выход');
    await pick(screen.getByRole('combobox', { name: 'Куда отправить' }), 'proxy');

    expect(draftRule()).toEqual({
      rule_set: ['github'],
      action: 'route',
      outbound: 'proxy',
    });
  });

  it('removes the sniffing fields when sniffing turns into rejecting', async () => {
    const rule = loadRule({
      rule_set: ['github'],
      action: 'sniff',
      sniffer: ['tls'],
      timeout: '1s',
    });

    renderWithQuery(<RuleEditForm rule={rule} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    await pick(screen.getByRole('combobox', { name: 'Что делать' }), 'оборвать');

    expect(draftRule()).toEqual({ rule_set: ['github'], action: 'reject' });
  });

  it('removes the routing fields when routing turns into another action', async () => {
    const rule = loadRule({
      rule_set: ['github'],
      outbound: 'proxy',
      override_port: 53,
    });

    renderWithQuery(<RuleEditForm rule={rule} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    await pick(screen.getByRole('combobox', { name: 'Что делать' }), 'оборвать');

    expect(draftRule()).toEqual({ rule_set: ['github'], action: 'reject' });
  });

  it('an added rule set lands in rule_set, the rest of the rule is untouched', async () => {
    renderWithQuery(<RuleEditForm rule={RULE} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    const sets = screen.getByRole('combobox', { name: 'Сеты правил' });

    await pick(sets, 'geoip-cn');
    await userEvent.keyboard('{Escape}');

    expect(within(sets).getByText('github, geoip-cn')).toBeVisible();

    expect(draftRule()).toEqual({
      rule_set: ['github', 'geoip-cn'],
      outbound: 'proxy',
    });
  });

  it('removing all rule sets deletes the field from the node instead of writing an empty list', async () => {
    renderWithQuery(<RuleEditForm rule={RULE} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    await pick(screen.getByRole('combobox', { name: 'Сеты правил' }), 'github');
    await userEvent.keyboard('{Escape}');

    expect(draftRule()).toEqual({ outbound: 'proxy' });
  });

  it('an outbound edit does not rewrite rule_set written as a string', async () => {
    const rule = loadRule({ rule_set: 'github', outbound: 'proxy' });

    renderWithQuery(<RuleEditForm rule={rule} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    expect(within(screen.getByRole('combobox', { name: 'Сеты правил' })).getByText('github')).toBeVisible();

    await pick(screen.getByRole('combobox', { name: 'Куда отправить' }), 'direct');

    expect(draftRule()).toEqual({ rule_set: 'github', outbound: 'direct' });
  });

  it('a rule set that is not in the document stays selected and is marked', async () => {
    const rule = loadRule({ rule_set: ['old-set'], outbound: 'proxy' });

    renderWithQuery(<RuleEditForm rule={rule} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    const sets = screen.getByRole('combobox', { name: 'Сеты правил' });

    expect(within(sets).getByText('old-set')).toBeVisible();

    await pick(sets, 'github');

    expect(screen.getByRole('option', { name: /old-set/ })).toHaveTextContent('old-setнет в документе');
    expect(screen.getByRole('option', { name: 'github' })).not.toHaveTextContent('нет в документе');
  });

  it('warns that a rule without rule sets and other conditions takes all traffic, but still writes it', async () => {
    renderWithQuery(<RuleEditForm rule={RULE} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    await pick(screen.getByRole('combobox', { name: 'Сеты правил' }), 'github');
    await userEvent.keyboard('{Escape}');

    expect(screen.getByRole('status')).toHaveTextContent(
      'Без условий правило заберёт весь трафик, и правила ниже не сработают.'
    );
    await waitFor(() => {
      expect(draftRule()).toEqual({ outbound: 'proxy' });
    });
  });

  it('for a rule with other conditions removing rule sets gives no warning', async () => {
    const rule = loadRule({
      rule_set: ['github'],
      port: 443,
      outbound: 'proxy',
    });

    renderWithQuery(<RuleEditForm rule={rule} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    await pick(screen.getByRole('combobox', { name: 'Сеты правил' }), 'github');
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('moves focus into a condition picked from the list', async () => {
    const rule = loadRule({ rule_set: ['github'], outbound: 'proxy' });

    renderWithQuery(<RuleEditForm rule={rule} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    await pick(screen.getByRole('combobox', { name: 'Добавить условие' }), 'Домен с поддоменами');

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Домен с поддоменами' })).toHaveFocus();
    });
  });

  it('an added condition lands in the node as a list, does not touch the rest of the rule', async () => {
    const rule = loadRule({ rule_set: ['github'], outbound: 'proxy' });

    renderWithQuery(<RuleEditForm rule={rule} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    await pick(screen.getByRole('combobox', { name: 'Добавить условие' }), 'Домен с поддоменами');
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Домен с поддоменами' }),
      'youtube.com{Enter}googlevideo.com'
    );

    expect(draftRule()).toEqual({
      rule_set: ['github'],
      outbound: 'proxy',
      domain_suffix: ['youtube.com', 'googlevideo.com'],
    });
  });

  it('a device picked from the suggestions lands in the condition as a source address and warns about a dynamic lease', async () => {
    ConfigDocumentState.getState().reset();
    ConfigDocumentState.getState().load(CONFIG);
    worker.use(...createDeviceHandlers());

    renderWithQuery(<RuleEditForm rule={RULE} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    await pick(screen.getByRole('combobox', { name: 'Добавить условие' }), 'Устройство или адрес источника');
    await userEvent.click(
      await within(await screen.findByRole('group', { name: 'Устройства' })).findByRole('option', {
        name: 'iphone-guest 192.168.1.120',
      })
    );

    expect(
      within(
        screen.getByRole('list', {
          name: 'Устройство или адрес источника: значения',
        })
      ).getByRole('listitem')
    ).toHaveTextContent('iphone-guest 192.168.1.120/32');
    // The local network around the picked device would add nothing to the rule.
    expect(screen.getByRole('group', { name: 'Устройства' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Сети' })).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Устройства с динамической арендой' })).toHaveTextContent(
      'iphone-guest: аренда динамическая, адрес может смениться'
    );

    expect(draftRule()).toEqual({
      rule_set: ['github'],
      outbound: 'proxy',
      source_ip_cidr: ['192.168.1.120/32'],
    });
  });

  it('for a device with a static lease does not warn about an address change', async () => {
    worker.use(...createDeviceHandlers());

    renderWithQuery(<RuleEditForm rule={RULE} outbounds={['direct', 'proxy']} ruleSets={RULE_SETS} />);

    await pick(screen.getByRole('combobox', { name: 'Добавить условие' }), 'Устройство или адрес источника');
    await userEvent.click(
      await within(await screen.findByRole('group', { name: 'Устройства' })).findByRole('option', {
        name: 'Ноутбук 192.168.1.60',
      })
    );

    expect(
      within(
        screen.getByRole('list', {
          name: 'Устройство или адрес источника: значения',
        })
      ).getByRole('listitem')
    ).toHaveTextContent('Ноутбук 192.168.1.60/32');
    expect(screen.queryByRole('list', { name: 'Устройства с динамической арендой' })).not.toBeInTheDocument();
  });
});

it('takes a JSON edit of an outbound changed in the form earlier once focus left the form', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  worker.use(...createDeviceHandlers());

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

  await pick(outbound, 'direct');
  redraw();
  await userEvent.click(document.body);

  ConfigDocumentState.getState().edit(['route', 'rules', 0, 'outbound'], 'proxy');
  redraw();

  await waitFor(() => {
    expect(within(outbound).getByText('proxy')).toBeVisible();
  });

  await userEvent.type(screen.getByRole('textbox', { name: 'Имя' }), 'Work');

  await waitFor(() => {
    expect(readRuleNames(ConfigDocumentState.getState().draft ?? '')).toEqual(['Work']);
  });
  expect(draftRule()).toEqual({ rule_set: ['github'], outbound: 'proxy' });
});
