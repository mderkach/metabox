import { worker } from '@test/browserWorker';
import { renderWithRouter } from '@test/renderWithRouter';
import { act, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { ConfigDocumentState, findValue } from '@entities/Config';
import { createDeviceHandlers } from '@entities/Device/__tests__/Device.handlers';
import { parseRuleSearch } from '@entities/Rule';
import { ruleSetHandlers } from '@entities/RuleSet/__tests__/RuleSet.handlers';

import { EditorPage } from '../ui/EditorPage';
import {
  CONFIG,
  configHandlers,
  draftRules,
  EDIT_RULES,
  editConfig,
  RECOGNIZED_CONFIG,
  WITH_RULE_SETS,
} from './EditorPage.fixture';

/** Opens a dropdown and picks an option with the mouse. */
async function pick(trigger: HTMLElement, name: string): Promise<void> {
  await userEvent.click(trigger);
  await userEvent.click(await screen.findByRole('option', { name }));
}

// The side panel is a column only on a wide screen; below that it is a sheet.
beforeEach(async () => {
  worker.use(...createDeviceHandlers(), ...ruleSetHandlers);
  await page.viewport(1280, 900);
});

describe('rules screen picked with the mouse', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    worker.use(...configHandlers(CONFIG));
  });

  it('an outbound change in the panel edits one line of the file, does not touch the rest of the rule', async () => {
    // A config without an unrecognized node: the outbound list is built from the parsed
    // config, and a node the schema did not accept leaves it empty: then
    // there would be nothing to choose from.
    worker.use(...configHandlers(RECOGNIZED_CONFIG));

    renderWithRouter(EditorPage);

    await userEvent.click(await screen.findByRole('button', { name: /, правило 1(,|$)/ }));

    const panel = await screen.findByRole('complementary');
    const outbound = within(panel).getByRole('combobox', { name: 'Куда отправить' });

    await pick(outbound, 'direct');

    expect(within(outbound).getByText('direct')).toBeVisible();

    await waitFor(() => {
      expect(ConfigDocumentState.getState().draft).not.toBeNull();
    });

    expect(findValue(ConfigDocumentState.getState().draft ?? '', ['route', 'rules', 0])).toEqual({
      rule_set: ['github'],
      outbound: 'direct',
    });
    expect(
      await screen.findByRole('button', { name: 'github → direct, правило 1, изменено в черновике' })
    ).toBeInTheDocument();
  });

  it('an outbound chosen in the form survives a switch to JSON and back', async () => {
    worker.use(...configHandlers(RECOGNIZED_CONFIG));

    renderWithRouter(EditorPage);

    await userEvent.click(await screen.findByRole('button', { name: /, правило 1(,|$)/ }));

    const panel = await screen.findByRole('complementary');

    await pick(within(panel).getByRole('combobox', { name: 'Куда отправить' }), 'direct');
    await userEvent.click(within(panel).getByRole('tab', { name: 'JSON' }));
    await waitFor(() => {
      expect(within(panel).queryByRole('combobox', { name: 'Куда отправить' })).not.toBeInTheDocument();
    });
    await userEvent.click(within(panel).getByRole('tab', { name: 'Форма' }));

    expect(within(within(panel).getByRole('combobox', { name: 'Куда отправить' })).getByText('direct')).toBeVisible();
  });
});

describe('rule list editing picked with the mouse', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    worker.use(...configHandlers(editConfig(EDIT_RULES)));
  });

  it('opens a new rule without writing it and writes it on the first condition, keeping focus', async () => {
    renderWithRouter(EditorPage);

    await userEvent.click(await screen.findByRole('button', { name: 'Добавить правило' }));

    const panel = await screen.findByRole('complementary', { name: 'Новое правило · место 4' });

    expect(ConfigDocumentState.getState().draft).toBeNull();
    expect(within(panel).getByText(/появится в черновике, когда у него будет условие/)).toBeInTheDocument();
    expect(within(panel).queryByRole('tab', { name: 'JSON' })).not.toBeInTheDocument();

    await pick(within(panel).getByRole('combobox', { name: 'Добавить условие' }), 'Домен');

    const domain = within(panel).getByRole('textbox', { name: 'Домен' });

    await userEvent.type(domain, 'a.example');

    await waitFor(() => {
      expect(draftRules()).toEqual([...EDIT_RULES, { domain: ['a.example'], outbound: 'proxy' }]);
    });
    expect(domain).toHaveFocus();
    expect(
      await screen.findByRole('button', { name: 'a.example → proxy, правило 4, изменено в черновике' })
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('closes the panel of a created rule once the draft is discarded', async () => {
    renderWithRouter(EditorPage);

    await userEvent.click(await screen.findByRole('button', { name: 'Добавить правило' }));

    const panel = await screen.findByRole('complementary', { name: 'Новое правило · место 4' });

    await pick(within(panel).getByRole('combobox', { name: 'Добавить условие' }), 'Домен');
    await userEvent.type(within(panel).getByRole('textbox', { name: 'Домен' }), 'a.example');
    await screen.findByRole('button', { name: 'a.example → proxy, правило 4, изменено в черновике' });

    act(() => {
      ConfigDocumentState.getState().discard();
    });

    await waitFor(() => {
      expect(screen.queryByRole('complementary', { name: 'a.example → proxy' })).not.toBeInTheDocument();
    });
  });

  it('in a config without rules the empty state button opens the first rule and the condition creates route.rules', async () => {
    worker.use(...configHandlers(JSON.stringify({ outbounds: [{ type: 'direct', tag: 'direct' }] }, null, 2)));

    renderWithRouter(EditorPage);

    expect(await screen.findByText('Правил нет')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Добавить правило' }));

    const panel = await screen.findByRole('complementary', { name: 'Новое правило · место 1' });

    expect(ConfigDocumentState.getState().draft).toBeNull();

    await pick(within(panel).getByRole('combobox', { name: 'Добавить условие' }), 'Домен');
    await userEvent.type(within(panel).getByRole('textbox', { name: 'Домен' }), 'a.example');

    await waitFor(() => {
      expect(draftRules()).toEqual([{ domain: ['a.example'], outbound: 'direct' }]);
    });
    expect(await screen.findByRole('table', { name: 'Правила маршрутизации' })).toBeInTheDocument();
  });
});

describe('rule sets of a rule from the panel picked with the mouse', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    worker.use(...configHandlers(WITH_RULE_SETS));
  });

  it('a rule set chosen in the form is visible in the rule conditions and in the rule set filter', async () => {
    const { router } = renderWithRouter(EditorPage, { validateSearch: parseRuleSearch });

    await userEvent.click(await screen.findByRole('button', { name: /, правило 3(,|$)/ }));

    const panel = await screen.findByRole('complementary');

    await pick(within(panel).getByRole('combobox', { name: 'Сеты правил' }), 'geoip-cn');
    await userEvent.keyboard('{Escape}');

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
    expect(screen.getByRole('button', { name: /, правило 3(,|$)/ })).toBeInTheDocument();
  });
});
