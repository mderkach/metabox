import { SHARED_NS } from '../src/shared/i18n/Shared.namespace.generated.ts';
import { E2E_TAG, expect, test, translate } from './fixtures/index.ts';

const RESOLVER = 'office-dns';
const ADDRESS = '192.0.2.54';
const DOMAIN = 'office.example';
const DIRECT = 'wan';
const PROXY = 'proxy';
const NODE = 'relay';
const CATALOG_SET = 'geosite-youtube';
const DIRECT_RULE = { action: 'route', domain: [DOMAIN], server: 'old-dns' };
const CONFIG = {
  log: { level: 'warn' },
  inbounds: [
    { type: 'socks', tag: 'client', listen: '127.0.0.1', listen_port: 11080 },
    { type: 'direct', tag: 'queries', listen: '127.0.0.1', listen_port: 1053, network: 'udp' },
  ],
  outbounds: [
    { type: 'direct', tag: DIRECT },
    { type: 'socks', tag: NODE, server: '192.0.2.5', server_port: 1080 },
    { type: 'selector', tag: PROXY, outbounds: [NODE] },
  ],
  route: {
    rules: [
      { action: 'hijack-dns', inbound: ['queries'] },
      { action: 'route', domain: [DOMAIN], outbound: DIRECT },
      { action: 'route', domain: ['proxy.example'], outbound: PROXY },
      { action: 'route', domain: ['relay.example'], outbound: NODE },
    ],
    final: PROXY,
  },
  dns: {
    servers: [
      { type: 'tcp', tag: 'old-dns', server: '192.0.2.53' },
      { type: 'tcp', tag: 'group-dns', server: '192.0.2.55', detour: PROXY },
      { type: 'hosts', tag: 'imported', predefined: { 'local.example': '192.0.2.1' } },
    ],
    rules: [DIRECT_RULE],
    final: 'old-dns',
    disable_cache: true,
  },
};

test(
  'adding a resolver only changes inventory until reassignment in the shared DNS draft',
  { tag: E2E_TAG.Mock },
  async ({ page, simpleDns: dns, simpleRoutesPage: routes, applyBar }, testInfo) => {
    await routes.openWithConfig(CONFIG);
    await dns.settings.click();
    await expect(dns.assignments).toBeVisible();
    await expect(dns.assignment(DOMAIN)).toContainText('old-dns');
    await test.step('add a TCP resolver and inspect the shared document', async () => {
      await dns.add.click();
      await dns.name.fill(RESOLVER);
      await dns.address.fill(ADDRESS);
      await dns.stage.click();
      await expect(dns.inventoryRow(RESOLVER)).toContainText(dns.unassigned);
      await expect(dns.assignment(DOMAIN)).toContainText('old-dns');
      await routes.jsonView.click();
      await expect(routes.configText).toHaveValue(new RegExp(RESOLVER));
      const text: unknown = JSON.parse(await routes.configText.inputValue());
      expect(text).toEqual({
        ...CONFIG,
        dns: { ...CONFIG.dns, servers: [...CONFIG.dns.servers, { tag: RESOLVER, type: 'tcp', server: ADDRESS }] },
      });
      await routes.simpleView.click();
      await dns.settings.click();
    });
    await test.step('reassign the direct path, leaving the other paths and imported settings intact', async () => {
      await dns.select(dns.assignment(DOMAIN), RESOLVER);
      await expect(dns.assignment(DOMAIN)).toContainText(RESOLVER);
      await dns.assignments.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath('dns-desktop.png') });
      await routes.jsonView.click();
      const staged: unknown = JSON.parse(await routes.configText.inputValue());
      expect(staged).toEqual({
        ...CONFIG,
        dns: {
          ...CONFIG.dns,
          servers: [...CONFIG.dns.servers, { tag: RESOLVER, type: 'tcp', server: ADDRESS }],
          rules: [{ ...DIRECT_RULE, server: RESOLVER }],
        },
      });
      await applyBar.apply();
      await expect(applyBar.nodeChanges).toContainText(translate(SHARED_NS, 'nodeKind.dnsRules'));
      await expect(applyBar.nodeChanges).toContainText(RESOLVER);
      await expect(applyBar.confirmPrompt).toBeHidden();
    });
  }
);

test.describe('touch DNS settings', () => {
  const PHONE = { width: 375, height: 812 };
  test.use({ hasTouch: true, viewport: PHONE });
  test(
    'the 375px DNS assignment distinguishes the proxy group from a specific exit without an eligible resolver',
    {
      tag: E2E_TAG.Mock,
    },
    async ({ page, simpleDns: dns, simpleRoutesPage: routes, applyBar }, testInfo) => {
      await page.addInitScript({ content: "localStorage.setItem('theme', 'dark')" });
      await routes.mockConfig(CONFIG);
      await page.goto('/config/simple');
      await dns.settings.click();
      await expect(dns.pathRow('relay.example')).toContainText(dns.noResolver);
      await expect(applyBar.dirty).toBeHidden();
      await dns.select(dns.assignment('proxy.example'), 'group-dns');
      await expect(dns.assignment('proxy.example')).toContainText('group-dns');
      await expect(dns.pathRow('relay.example')).toContainText(dns.noResolver);
      await dns.assignments.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath('dns-phone.png') });
      expect(await page.evaluate<number>('document.documentElement.scrollWidth')).toBeLessThanOrEqual(PHONE.width);
      await dns.add.click();
      await dns.name.fill('relay-dns');
      await dns.address.fill(ADDRESS);
      await dns.select(dns.detour, NODE);
      await dns.stage.click();
      await expect(dns.inventoryRow('relay-dns')).toContainText(dns.unassigned);
      await dns.select(dns.assignment('relay.example'), 'relay-dns');
      await expect(dns.assignment('proxy.example')).toContainText('group-dns');
      await routes.jsonView.click();
      const staged: unknown = JSON.parse(await routes.configText.inputValue());
      expect(staged).toEqual({
        ...CONFIG,
        dns: {
          ...CONFIG.dns,
          servers: [...CONFIG.dns.servers, { type: 'tcp', tag: 'relay-dns', server: ADDRESS, detour: NODE }],
          rules: [
            DIRECT_RULE,
            { action: 'route', domain: ['proxy.example'], server: 'group-dns' },
            { action: 'route', domain: ['relay.example'], server: 'relay-dns' },
          ],
        },
      });
    }
  );
});

test(
  'an exact DNS assignment stays editable ahead of a later catalog pair',
  { tag: E2E_TAG.Mock },
  async ({ simpleDns: dns, simpleRoutesPage: routes, applyBar }) => {
    const catalogDns = { action: 'route', rule_set: [CATALOG_SET], server: DIRECT_RULE.server };
    const config = {
      ...CONFIG,
      route: {
        ...CONFIG.route,
        rules: [...CONFIG.route.rules, { action: 'route', rule_set: [CATALOG_SET], outbound: DIRECT }],
        rule_set: [{ type: 'remote', tag: CATALOG_SET, url: 'https://catalog.example.invalid/youtube.srs' }],
      },
      dns: {
        ...CONFIG.dns,
        servers: [...CONFIG.dns.servers, { type: 'tcp', tag: RESOLVER, server: ADDRESS }],
        rules: [DIRECT_RULE, catalogDns],
      },
    };
    await routes.openWithConfig(config);
    await dns.settings.click();
    await expect(dns.assignment(DOMAIN)).toContainText(DIRECT_RULE.server);
    await dns.select(dns.assignment(DOMAIN), RESOLVER);
    await expect(dns.assignment(DOMAIN)).toContainText(RESOLVER);
    await routes.jsonView.click();
    const staged: unknown = JSON.parse(await routes.configText.inputValue());
    expect(staged).toEqual({
      ...config,
      dns: { ...config.dns, rules: [{ ...DIRECT_RULE, server: RESOLVER }, catalogDns] },
    });
    await applyBar.apply();
    await expect(applyBar.nodeChanges).toContainText(translate(SHARED_NS, 'nodeKind.dnsRules'));
    await applyBar.showChangesText();
    await expect(applyBar.diff).toContainText(RESOLVER);
  }
);
