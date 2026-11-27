import { parse } from 'jsonc-parser';

import { CONFIG_DNS_EDIT_NS } from '../src/features/Config/ConfigDnsEdit/i18n/ConfigDnsEdit.namespace.generated.ts';
import { E2E_TAG, expect, test, translate } from './fixtures/index.ts';

const SERVERS = [
  { type: 'tcp', tag: 'primary', server: '192.0.2.10' },
  { type: 'tcp', tag: 'alpha', server: '192.0.2.11' },
  { type: 'tcp', tag: 'beta', server: '192.0.2.12' },
  { type: 'tcp', tag: 'gamma', server: '192.0.2.13' },
];
const CHAIN = { type: 'fallback', tag: 'chain', servers: ['primary', 'alpha', 'beta'], timeout: '2s' };
const HOSTS = { type: 'hosts', tag: 'lan', path: ['example.hosts'], predefined: { 'keep.example': '192.0.2.80' } };
const CONFIG = {
  dns: {
    servers: [...SERVERS, CHAIN, HOSTS],
    final: 'chain',
    strategy: 'prefer_ipv4',
    rules: [{ domain: 'keep.example', server: 'lan' }],
  },
  route: { default_domain_resolver: 'primary' },
};
const NOTE = '// retain this imported note';
const INDENT = 2;
const JSONC = JSON.stringify(CONFIG, null, INDENT).replace('  "route"', `  ${NOTE}\n  "route"`);
const DOMAIN = 'lab.home.arpa';
const ADDRESSES = ['192.0.2.44', '2001:db8::44'];

test(
  'the backup order follows the chain across pointer and keyboard edits',
  { tag: E2E_TAG.Mock },
  async ({ simpleDns: dns, simpleRoutesPage: routes, applyBar }) => {
    await routes.openWithConfig(JSONC);
    await dns.settings.click();
    await dns.backups.click();
    const list = dns.backupList('chain').getByRole('listitem');

    await expect(dns.backupButton('up', 'alpha')).toBeDisabled();
    await expect(dns.backupButton('down', 'beta')).toBeDisabled();
    await dns.addBackup('gamma').press('Enter');
    const appended = list.filter({ hasText: 'gamma' });
    await expect(appended).toBeFocused();
    await appended.press('Enter');
    await expect(list).toHaveText([/alpha/, /beta/, /gamma/]);
    await dns.backupButton('up', 'gamma').press('Enter');
    await expect(list).toHaveText([/alpha/, /gamma/, /beta/]);
    await expect(dns.backupButton('up', 'gamma')).toBeFocused();
    await dns.dragBackup('chain', 'beta', 'alpha');
    await expect(list).toHaveText([/beta/, /alpha/, /gamma/]);
    await dns.backupButton('removeTag', 'alpha').press('Enter');
    await expect(list.filter({ hasText: 'gamma' })).toBeFocused();

    await routes.editorView.click();
    await expect(applyBar.dirty).toBeVisible();
    await routes.jsonView.click();
    const staged = await routes.configText.inputValue();
    expect(staged).toContain(NOTE);
    expect(parse(staged)).toEqual({
      ...CONFIG,
      dns: { ...CONFIG.dns, servers: [...SERVERS, { ...CHAIN, servers: ['primary', 'beta', 'gamma'] }, HOSTS] },
    });
    await applyBar.apply();
    await expect(applyBar.nodeChanges).toContainText('chain');
    await applyBar.showChangesText();
    await expect(applyBar.diff).toContainText('"gamma"');
    await expect(applyBar.confirmPrompt).toBeHidden();
  }
);

test(
  'address family and static records share the JSONC draft and Apply diff',
  { tag: E2E_TAG.Mock },
  async ({ simpleDns: dns, simpleRoutesPage: routes, applyBar }) => {
    await routes.openWithConfig(JSONC);
    await dns.settings.click();
    await dns.advanced.click();
    await expect(dns.family).toContainText(translate(CONFIG_DNS_EDIT_NS, 'options.strategy.prefer_ipv4'));
    await dns.hosts('lan').click();
    await dns.addRecord.click();
    await expect(dns.domain).toBeFocused();
    await dns.domain.press('Escape');
    await expect(dns.addRecord).toBeFocused();
    await expect(applyBar.dirty).toBeHidden();

    await dns.addRecord.click();
    await dns.domain.fill(DOMAIN);
    await dns.addresses.fill('999.0.0.1');
    await dns.stage.click();
    await expect(dns.addresses).toHaveAttribute('aria-invalid', 'true');
    await dns.addresses.fill(ADDRESSES.join(', '));
    await dns.stage.click();
    await expect(dns.addRecord).toBeFocused();
    await dns.recordButton('editDomain', DOMAIN).click();
    await expect(dns.addresses).toHaveValue(ADDRESSES.join(', '));
    const renamed = 'dual.home.arpa';
    await dns.domain.fill(renamed);
    await dns.saveRecord.click();
    await dns.recordButton('removeDomain', 'keep.example').press('Enter');
    await expect(dns.addRecord).toBeFocused();
    await dns.select(dns.family, translate(CONFIG_DNS_EDIT_NS, 'options.strategy.prefer_ipv6'));

    await routes.jsonView.click();
    const staged = await routes.configText.inputValue();
    expect(staged).toContain(NOTE);
    expect(parse(staged)).toEqual({
      ...CONFIG,
      dns: {
        ...CONFIG.dns,
        strategy: 'prefer_ipv6',
        servers: [...SERVERS, CHAIN, { ...HOSTS, predefined: { [renamed]: ADDRESSES } }],
      },
    });
    await applyBar.apply();
    await applyBar.showChangesText();
    for (const value of [renamed, ...ADDRESSES, 'prefer_ipv6']) await expect(applyBar.diff).toContainText(value);
    await expect(applyBar.confirmPrompt).toBeHidden();
  }
);

test(
  'an imported parallel chain remains readable while inventory can be extended',
  { tag: E2E_TAG.Mock },
  async ({ simpleDns: dns, simpleRoutesPage: routes }) => {
    const chain = { ...CHAIN, strategy: 'parallel' };
    const config = { ...CONFIG, dns: { ...CONFIG.dns, servers: [...SERVERS, chain, HOSTS] } };
    await routes.openWithConfig(config);
    await dns.settings.click();
    await dns.backups.click();
    await expect(dns.chain('chain')).toContainText('parallel');
    await expect(dns.chain('chain').getByRole('listitem')).toHaveText(chain.servers);
    await expect(dns.chain('chain').getByRole('button')).toHaveCount(0);
    await dns.add.click();
    await dns.name.fill('new-dns');
    await dns.address.fill('192.0.2.20');
    await dns.stage.click();
    await routes.jsonView.click();
    const staged: unknown = JSON.parse(await routes.configText.inputValue());
    expect(staged).toEqual({
      ...config,
      dns: { ...config.dns, servers: [...config.dns.servers, { type: 'tcp', tag: 'new-dns', server: '192.0.2.20' }] },
    });
  }
);
