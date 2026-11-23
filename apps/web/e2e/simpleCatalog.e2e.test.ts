import { E2E_TAG, expect, test, translate } from './fixtures/index.ts';

const CATALOG = 'features/Rule/RuleCatalogAdd';
const CORE_VERSION = '1.14.3-extended-2.7.3';
const DESKTOP = { width: 1280, height: 800 };
const TOUCH_TARGET = 44;
const JSON_INDENT = 2;
const PHONE = { width: 375, height: 812 };
const EXIT = 'media-exit';
const RESOLVER = 'media-resolver';
const CATEGORY = 'youtube';
const SET_TAG = 'geosite-youtube';
const EXISTING_TAG = 'video-sites';
const SET_URL = 'https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-youtube.srs';
const HIJACK = { inbound: ['queries'], action: 'hijack-dns' };
const CONFIG = {
  inbounds: [
    { type: 'socks', tag: 'client', listen: '127.0.0.1', listen_port: 11080 },
    { type: 'direct', tag: 'queries', listen: '127.0.0.1', listen_port: 1053, network: 'udp' },
  ],
  outbounds: [
    { type: 'direct', tag: EXIT },
    { type: 'socks', tag: 'backup', server: '192.0.2.8', server_port: 1080 },
  ],
  dns: { servers: [{ type: 'tcp', tag: RESOLVER, detour: EXIT, server: '192.0.2.53' }], rules: [] },
  route: { rules: [HIJACK] },
};

test(
  'the desktop catalog previews and stages one source-qualified route and DNS pair before Apply',
  { tag: E2E_TAG.Mock },
  async ({ page, simpleCatalog: catalog, simpleRoutesPage: routes, applyBar }, testInfo) => {
    await page.setViewportSize(DESKTOP);
    await page.addInitScript({ content: "localStorage.setItem('theme', 'light')" });
    await routes.openWithConfig(CONFIG, CORE_VERSION);

    await test.step('two catalog sources offer the same service, and choosing one still leaves the draft clean', async () => {
      await catalog.trigger.press('Enter');
      await expect(catalog.search).toBeFocused();
      await catalog.search.fill(CATEGORY);
      await expect(catalog.service(CATEGORY, 'Runet Freedom')).toBeVisible();
      await catalog.service(CATEGORY, 'v2fly').click();
      await catalog.select(catalog.outbound, EXIT);
      await catalog.select(catalog.resolver, RESOLVER);
      await expect(catalog.submit).toBeEnabled();
      await expect(catalog.dialog).toContainText(translate(CATALOG, 'preview'));
      await expect(catalog.dialog).toContainText(SET_TAG);
      await expect(applyBar.dirty).toBeHidden();
      await page.screenshot({ path: testInfo.outputPath('catalog-desktop.png') });
    });

    await test.step('one submission returns focus to Rules and puts exactly the selected entries into the shared draft', async () => {
      await catalog.submit.press('Enter');
      await expect(catalog.dialog).toBeHidden();
      await expect(catalog.trigger).toBeFocused();
      await expect(routes.rules).toContainText(SET_TAG);
      await routes.jsonView.click();
      await expect(routes.configText).toHaveValue(new RegExp(SET_TAG));
      expect(JSON.parse(await routes.configText.inputValue())).toEqual({
        ...CONFIG,
        route: {
          rules: [HIJACK, { action: 'route', rule_set: [SET_TAG], outbound: EXIT }],
          rule_set: [{ type: 'remote', tag: SET_TAG, format: 'binary', url: SET_URL }],
        },
        dns: { ...CONFIG.dns, rules: [{ action: 'route', rule_set: [SET_TAG], server: RESOLVER }] },
      });
      await applyBar.apply();
      await expect(applyBar.ruleChanges).toContainText(SET_TAG);
      await expect(applyBar.nodeChanges).toContainText(translate('shared', 'nodeKind.dnsRules'));
      await expect(applyBar.nodeChanges).toContainText(SET_TAG);
      await expect(applyBar.confirmPrompt).toBeHidden();
    });
  }
);

test.describe('phone', () => {
  test.use({ hasTouch: true, viewport: PHONE });
  test(
    'the 375px catalog reuses an existing DNS rule, shows only the route diff and keeps a repeated pair unchanged',
    { tag: E2E_TAG.Mock },
    async ({ page, simpleCatalog: catalog, simpleRoutesPage: routes, applyBar }, testInfo) => {
      const set = { type: 'remote', tag: EXISTING_TAG, format: 'binary', url: SET_URL };
      const config = {
        ...CONFIG,
        dns: { ...CONFIG.dns, rules: [{ rule_set: [EXISTING_TAG], action: 'route', server: RESOLVER }] },
        route: { ...CONFIG.route, rule_set: [set] },
      };
      await page.addInitScript({ content: "localStorage.setItem('theme', 'dark')" });
      await routes.openWithConfig(config, CORE_VERSION);

      await catalog.trigger.click();
      await catalog.search.fill(CATEGORY);
      await catalog.service(CATEGORY, 'v2fly').click();
      await catalog.select(catalog.outbound, EXIT);
      await expect(catalog.submit).toBeEnabled();
      await expect(catalog.dialog).toContainText(EXISTING_TAG);
      await expect(catalog.dialog).toContainText(translate(CATALOG, 'dnsRow', { position: 1 }));
      await expect(catalog.dialog).toContainText(translate(CATALOG, 'reused'));
      await expect(catalog.resolver).toContainText(RESOLVER);
      expect(
        await catalog.dialog.evaluate(
          (element: { scrollWidth: number; clientWidth: number }) => element.scrollWidth - element.clientWidth
        )
      ).toBeLessThanOrEqual(0);
      expect(await page.evaluate<number>('document.documentElement.scrollWidth')).toBeLessThanOrEqual(PHONE.width);
      for (const field of [catalog.search, catalog.outbound, catalog.resolver, catalog.cancel, catalog.submit]) {
        expect((await field.boundingBox())?.height).toBeGreaterThanOrEqual(TOUCH_TARGET);
      }
      await page.screenshot({ path: testInfo.outputPath('catalog-phone.png') });
      await catalog.submit.click();
      await expect(catalog.trigger).toBeFocused();
      await applyBar.apply();
      await expect(applyBar.ruleChanges).toContainText(EXISTING_TAG);
      await expect(applyBar.nodeChanges).toBeHidden();
      await page.keyboard.press('Escape');
      await routes.jsonView.click();
      const stagedText = await routes.configText.inputValue();
      await routes.simpleView.click();
      await catalog.trigger.click();
      await catalog.search.fill(CATEGORY);
      await catalog.service(CATEGORY, 'v2fly').click();
      await catalog.select(catalog.outbound, EXIT);
      await catalog.done.click();
      await routes.jsonView.click();
      await expect(routes.configText).toHaveValue(stagedText);
    }
  );

  test(
    'an imported DNS conflict identifies the blocked rule and leaves the pre-existing draft byte-for-byte intact',
    { tag: E2E_TAG.Mock },
    async ({ simpleCatalog: catalog, simpleRoutesPage: routes }) => {
      const imported = {
        ...CONFIG,
        dns: {
          ...CONFIG.dns,
          rules: [{ domain_suffix: ['youtube.com'], action: 'reject' }],
        },
      };
      await routes.openWithConfig(imported, CORE_VERSION);
      await routes.jsonView.click();
      const original = JSON.stringify({ ...imported, log: { level: 'warn' } }, null, JSON_INDENT);
      await routes.configText.fill(original);
      await routes.simpleView.click();

      await catalog.trigger.click();
      await catalog.search.fill(CATEGORY);
      await catalog.service(CATEGORY, 'v2fly').click();
      await catalog.select(catalog.outbound, EXIT);
      await catalog.select(catalog.resolver, RESOLVER);
      await expect(catalog.submit).toBeDisabled();
      await expect(catalog.dialog).toContainText(translate(CATALOG, 'blocker.dnsConflict', { detail: 1 }));
      await catalog.cancel.click();
      await expect(catalog.trigger).toBeFocused();
      await routes.jsonView.click();
      await expect(routes.configText).toHaveValue(original);
    }
  );

  test(
    'the empty configuration opens the same catalog from a suggested service and Escape restores focus',
    { tag: E2E_TAG.Mock },
    async ({ page, simpleCatalog: catalog, simpleRoutesPage: routes, applyBar }) => {
      await routes.openWithConfig({}, CORE_VERSION);
      const suggestion = routes.rules.getByRole('button', { name: 'YouTube', exact: true });
      await suggestion.press('Enter');
      await expect(catalog.search).toHaveValue(/^youtube$/i);
      await expect(catalog.service(CATEGORY, 'v2fly')).toBeVisible();
      await expect(catalog.submit).toBeDisabled();
      await page.keyboard.press('Escape');
      await expect(suggestion).toBeFocused();
      await expect(applyBar.dirty).toBeHidden();
    }
  );
});
