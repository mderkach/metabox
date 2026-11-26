import { linkOptions } from '@tanstack/react-router';
import { renderWithRouter } from '@test/renderWithRouter';
import { RULE_SET_LINKS } from '@test/ruleSetLinks';
import { server } from '@test/server';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18next from 'i18next';
import { beforeEach, describe, expect, it } from 'vitest';

import { ConfigDocumentStore, selectConfigCurrent, type ConfigDocument } from '@entities/Config';
import { createDeviceHandlers } from '@entities/Device/__tests__/Device.handlers';
import { ruleSetHandlers } from '@entities/RuleSet/__tests__/RuleSet.handlers';

import { SIMPLE_ROUTES_NS } from '../i18n/SimpleRoutes.namespace.generated';
import { toSimpleRoutes } from '../model/SimpleRoutes.model';
import { SimpleRoutesRules } from '../ui/SimpleRoutesRules';

const SET = { type: 'local', tag: 'work', path: 'work.srs', format: 'binary' } as const;

function renderService(ruleSets: NonNullable<NonNullable<ConfigDocument['route']>['rule_set']>) {
  const config: ConfigDocument = {
    route: {
      rule_set: ruleSets,
      rules: [
        { action: 'sniff' },
        { type: 'logical', mode: 'or', rules: [{ rule_set: 'work' }, { rule_set: 'work' }], outbound: 'elsewhere' },
        { rule_set: 'work', outbound: 'office' },
      ],
    },
    dns: {
      rules: [
        { domain: 'other.example', server: 'local' },
        { rule_set: 'work', server: 'remote' },
      ],
    },
  };
  const text = JSON.stringify(config, null, 2);
  ConfigDocumentStore.getState().load(text);

  renderWithRouter(
    () => (
      <SimpleRoutesRules
        links={{ self: '/config/simple', rule: (rule) => linkOptions({ to: '/config', search: { rule } }) }}
        referenceLink={RULE_SET_LINKS.reference}
        onOutboundChange={() => {}}
        model={toSimpleRoutes(config, text, text)}
        text={text}
        outbound='office'
      />
    ),
    {
      path: '/config/simple',
      initialEntry: '/config/simple?outbound=office',
    }
  );

  return text;
}

describe('SimpleRoutesRules', () => {
  beforeEach(() => {
    ConfigDocumentStore.getState().reset();
    server.use(...createDeviceHandlers(), ...ruleSetHandlers);
  });

  it('shows references outside the outbound filter and counts a nested rule only once', async () => {
    const user = userEvent.setup();
    const text = renderService([SET]);
    const service = await screen.findByRole('button', { name: 'work' });

    expect(screen.getByText('3.')).toBeInTheDocument();
    expect(screen.queryByText('2.')).not.toBeInTheDocument();
    await user.click(service);
    expect(service).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/work\.srs/u)).toBeVisible();
    const rules = within(screen.getByRole('region', { name: 'Правила' }));
    const links = rules.getAllByRole('link', { name: 'Правило 2' });
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/config?rule=2', '/config/dnsRules?node=2']);
    expect(rules.getByRole('link', { name: 'Правило 3' })).toHaveAttribute('href', '/config?rule=3');

    await user.click(service);
    expect(service).toHaveAttribute('aria-expanded', 'false');
    expect(rules.queryByRole('link', { name: 'Правило 3' })).not.toBeInTheDocument();
    expect(selectConfigCurrent(ConfigDocumentStore.getState())).toBe(text);
  });

  it.each([
    { source: 'missing', definitions: [] },
    { source: 'ambiguous', definitions: [SET, { ...SET, path: 'other.srs' }] },
  ])('keeps actual references visible when the source is $source', async ({ definitions }) => {
    const user = userEvent.setup();
    renderService(definitions);
    await user.click(await screen.findByRole('button', { name: 'work' }));

    expect(screen.getByText(i18next.t('list.sourceUnavailable', { ns: SIMPLE_ROUTES_NS }))).toBeVisible();
    expect(screen.queryByText(/work\.srs|other\.srs/u)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Правило 3' })).toHaveAttribute('href', '/config?rule=3');
  });
});
