import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { ConfigDocumentState } from '@entities/Config';
import { toRuleSetCatalog } from '@entities/RuleSet';
import { RULE_SET_CATALOG_FIXTURE } from '@entities/RuleSet/__tests__/RuleSet.fixture';

import { RuleSetAddForm } from '../ui/RuleSetAddForm';

const CATALOG = toRuleSetCatalog(RULE_SET_CATALOG_FIXTURE);
const CATALOG_CATEGORY = 'youtube';
const OFF_CATALOG_CATEGORY = 'mystuff';
const RUNET_BLOCKED_ALL =
  'https://raw.githubusercontent.com/runetfreedom/russia-v2ray-rules-dat/release/sing-box/rule-set-geosite/geosite-ru-blocked-all.srs';
const RUNET_GEOIP_BLOCKED =
  'https://raw.githubusercontent.com/runetfreedom/russia-v2ray-rules-dat/release/sing-box/rule-set-geoip/geoip-ru-blocked.srs';

function renderForm(outbounds: string[] = []) {
  return render(<RuleSetAddForm catalog={CATALOG} takenTags={[]} outbounds={outbounds} />);
}

describe('rule set add form', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
  });

  it('warns about a category that is not in the catalog', async () => {
    const user = userEvent.setup();

    renderForm();

    await user.type(screen.getByLabelText('Категория'), OFF_CATALOG_CATEGORY);

    expect(await screen.findByRole('status')).toHaveTextContent('Категории нет в перечне поставщика');
  });

  it('does not warn about a category from the catalog', async () => {
    const user = userEvent.setup();

    renderForm();

    await user.type(screen.getByLabelText('Категория'), CATALOG_CATEGORY);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('on its own address does not judge the category: it has no catalog', async () => {
    const user = userEvent.setup();

    renderForm();

    await user.type(screen.getByLabelText('Категория'), OFF_CATALOG_CATEGORY);
    await user.type(screen.getByLabelText('Адрес сета'), 'https://example.com/list.srs');

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('suggests a category from the catalog and builds its address', async () => {
    const user = userEvent.setup();

    renderForm();

    await user.type(screen.getByLabelText('Категория'), 'ru-blocked-a');
    expect(await screen.findByRole('option', { name: 'ru-blocked-all' })).toBeInTheDocument();

    await user.keyboard('{ArrowDown}{Enter}');

    expect(screen.getByLabelText('Адрес сета')).toHaveValue(RUNET_BLOCKED_ALL);
    expect(screen.getByLabelText('Имя сета')).toHaveValue('geosite-ru-blocked-all');
  });

  it('opens a selection on focus, without input', async () => {
    const user = userEvent.setup();

    renderForm();

    await user.click(screen.getByLabelText('Категория'));

    expect(await screen.findByRole('option', { name: 'ru-blocked' })).toBeInTheDocument();
  });

  // Sites and addresses at a provider are different files: switching the list kind
  // must rebuild the address, not leave the link to the sites list.
  it('switches the list kind and rebuilds the address', async () => {
    const user = userEvent.setup();

    renderForm();

    await user.type(screen.getByLabelText('Категория'), 'ru-blocked');
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'IP-адреса' }));

    expect(screen.getByLabelText('Адрес сета')).toHaveValue(RUNET_GEOIP_BLOCKED);
    expect(screen.getByLabelText('Имя сета')).toHaveValue('geoip-ru-blocked');
  });

  it('says when the catalog is checked against the provider', () => {
    renderForm();

    expect(screen.getByText(/Перечень сверен с поставщиком/)).toBeInTheDocument();
  });

  it('suggests a node for download from the config outbounds', async () => {
    const user = userEvent.setup();

    renderForm(['direct', 'proxy', 'proxy-fi']);

    await user.click(screen.getByRole('button', { name: 'Ещё настройки' }));
    await user.type(screen.getByLabelText('Качать через узел'), 'prox');

    const options = await screen.findAllByRole('option');

    expect(options.map((option) => option.textContent)).toEqual(['proxy', 'proxy-fi']);
  });
});
