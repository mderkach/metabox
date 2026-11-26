import { parse } from 'jsonc-parser';

import { SIMPLE_ROUTES_NS } from '../src/pages/SimpleRoutes/i18n/SimpleRoutes.namespace.generated.ts';
import { RULE_SET_TABLE_NS } from '../src/widgets/RuleSet/RuleSetTable/i18n/RuleSetTable.namespace.generated.ts';
import { E2E_TAG, expect, test, translate } from './fixtures/index.ts';

const DIRECT = 'direct';
const MEDIA = 'media';
const NEWS = 'news.example.invalid';
const MUSIC = 'music.example.invalid';
const SITE = 'docs.example.invalid';
const DEVICE_LABEL = 'Ноутбук · 192.168.1.60';
const SET_TAG = 'video-sites';
const DEVICE = '192.168.1.60';
const COMMENT = '// Keep the imported rule as supplied.';
const PHONE = { width: 375, height: 812 };
const DESKTOP = { width: 1280, height: 800 };
const INDENT = 2;
const POSITION = { first: 1, second: 2, third: 3, fourth: 4 } as const;
const DNS_HIJACK = { action: 'hijack-dns', inbound: ['dns-in'] };
const INBOUNDS = [
  { type: 'socks', tag: 'socks-in', listen_port: 1080 },
  { type: 'direct', tag: 'dns-in', listen_port: 1053, network: 'udp' },
];
const NEWS_RULE = { action: 'route', domain: [NEWS], outbound: DIRECT };
const MUSIC_RULE = { action: 'route', domain: [MUSIC], outbound: MEDIA };
const SERVICE = { action: 'route', rule_set: [SET_TAG], outbound: MEDIA };
const IMPORTED_PORT = 8443;
const IMPORTED = {
  type: 'logical',
  mode: 'or',
  rules: [{ domain_suffix: ['private.invalid'] }, { port: [IMPORTED_PORT] }],
  action: 'reject',
};
const CONFIG = {
  outbounds: [
    { type: 'direct', tag: DIRECT },
    { type: 'socks', tag: MEDIA, server: '192.0.2.8', server_port: 1080 },
  ],
  dns: {
    servers: [{ type: 'tcp', tag: 'remote-dns', server: '192.0.2.53' }],
    rules: [
      { domain: ['internal.invalid'], action: 'reject' },
      { rule_set: [SET_TAG], action: 'route', server: 'remote-dns' },
    ],
  },
  route: {
    rules: [NEWS_RULE, MUSIC_RULE, SERVICE, IMPORTED],
    rule_set: [
      {
        type: 'remote',
        tag: SET_TAG,
        format: 'binary',
        url: 'https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-youtube.srs',
      },
    ],
  },
};

function withImportComment(config: object) {
  return JSON.stringify(config, null, INDENT).replace('"mode": "or"', `${COMMENT}\n        "mode": "or"`);
}

test(
  'an outbound deep link retains rule positions and reveals actual route and DNS references in the service row',
  { tag: E2E_TAG.Mock },
  async ({ page, simpleRuleControls: controls, simpleRoutesPage: routes, applyBar }, testInfo) => {
    await page.setViewportSize(DESKTOP);
    await routes.mockConfig(CONFIG);
    await routes.goto(MEDIA);

    await test.step('both views retain the positions in the whole draft', async () => {
      await expect(controls.byType).toHaveAttribute('aria-pressed', 'true');
      await expect(controls.row(MUSIC)).toHaveAttribute('value', String(POSITION.second));
      await expect(controls.row(NEWS)).toBeHidden();
      await controls.byOrder.click();
      await expect(controls.row(MUSIC)).toHaveAttribute('value', String(POSITION.second));
      await expect(controls.row(SET_TAG)).toHaveAttribute('value', String(POSITION.third));
    });

    await test.step('the expanded service names its catalog and links to the two referenced rules', async () => {
      await controls.service(SET_TAG).click();
      const service = controls.row(SET_TAG);
      await expect(service).toContainText('v2fly');
      await expect(service).toContainText(translate(RULE_SET_TABLE_NS, 'details.routeRules'));
      await expect(service).toContainText(translate(RULE_SET_TABLE_NS, 'details.dnsRules'));
      await expect(controls.reference(service, POSITION.third)).toHaveAttribute('href', '/config?rule=3');
      await expect(controls.reference(service, POSITION.second)).toHaveAttribute('href', '/config/dnsRules?node=2');
      await page.screenshot({ path: testInfo.outputPath('rule-order-desktop.png') });
    });

    await test.step('clearing and choosing a filter changes the URL and the visible rows without changing the draft', async () => {
      await controls.clearFilter.click();
      await expect(page).toHaveURL('/config/simple');
      await expect(controls.row(NEWS)).toHaveAttribute('value', String(POSITION.first));
      await controls.select(controls.filter, DIRECT);
      await expect(page).toHaveURL('/config/simple?outbound=direct');
      await expect(controls.row(MUSIC)).toBeHidden();
      await expect(applyBar.dirty).toBeHidden();
    });
  }
);

test(
  'pointer and keyboard reorder the shared draft while preserving an imported rule and its JSONC comment',
  { tag: E2E_TAG.Mock },
  async ({ simpleRoutesPage: routes, simpleRuleControls: controls }) => {
    const original = withImportComment(CONFIG);
    await routes.openWithConfig(original);
    await controls.byOrder.click();

    await test.step('the imported rule stays in Editor and cannot be crossed from Simple', async () => {
      await expect(
        routes.rules.getByRole('link', { name: translate(SIMPLE_ROUTES_NS, 'list.advanced'), exact: true })
      ).toHaveAttribute('href', '/config?rule=4');
      await controls.move(POSITION.third, 'down').click();
      await expect(routes.rules).toContainText(
        translate(SIMPLE_ROUTES_NS, 'list.advancedMove', { index: POSITION.fourth })
      );
      await expect(controls.row(SET_TAG)).toHaveAttribute('value', String(POSITION.third));
    });

    await test.step('dragging a supported rule changes its position in Simple and JSON', async () => {
      await controls.drag(POSITION.second).dragTo(controls.row(NEWS));
      await expect(controls.row(MUSIC)).toHaveAttribute('value', String(POSITION.first));
      await routes.jsonView.click();
      await expect(routes.configText).toHaveValue(new RegExp(COMMENT));
      const staged: unknown = parse(await routes.configText.inputValue());
      expect(staged).toEqual({
        ...CONFIG,
        route: { ...CONFIG.route, rules: [MUSIC_RULE, NEWS_RULE, SERVICE, IMPORTED] },
      });
    });

    await test.step('keyboard moves the rule back and the imported rule remains intact', async () => {
      await routes.simpleView.click();
      await controls.byOrder.click();
      await controls.move(POSITION.first, 'down').press('Enter');
      await expect(controls.row(MUSIC)).toHaveAttribute('value', String(POSITION.second));
      await routes.jsonView.click();
      const restoredText = await routes.configText.inputValue();
      expect(restoredText).toContain(COMMENT);
      const restored: unknown = parse(restoredText);
      expect(restored).toEqual(CONFIG);
    });
  }
);

test.describe('phone', () => {
  test.use({ viewport: PHONE, hasTouch: true });

  test(
    'a device exception and a custom domain preserve the verified leading DNS hijack',
    { tag: E2E_TAG.Mock },
    async ({ page, simpleRuleControls: controls, simpleRoutesPage: routes, applyBar }, testInfo) => {
      const config = { inbounds: INBOUNDS, outbounds: CONFIG.outbounds, route: { rules: [DNS_HIJACK, MUSIC_RULE] } };
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await routes.openWithConfig(config);

      await test.step('the exception preview identifies the device and its position ahead of the original rule', async () => {
        await controls.exception(MUSIC).click();
        await controls.select(controls.device, /192\.168\.1\.60/);
        await controls.select(controls.outbound, DIRECT);
        await expect(controls.form).toContainText(
          translate(SIMPLE_ROUTES_NS, 'custom.preview', {
            position: POSITION.second,
            scope: DEVICE_LABEL,
            outbound: DIRECT,
          })
        );
        await expect(controls.form).toContainText(
          translate(SIMPLE_ROUTES_NS, 'custom.before', { position: POSITION.second, next: POSITION.third })
        );
        await expect(applyBar.dirty).toBeHidden();
        await page.screenshot({ path: testInfo.outputPath('device-exception-phone.png') });
        await controls.submit.click();
        await expect(controls.form).toBeHidden();
        await routes.jsonView.click();
        const staged: unknown = parse(await routes.configText.inputValue());
        expect(staged).toEqual({
          ...config,
          route: { rules: [DNS_HIJACK, { ...MUSIC_RULE, outbound: DIRECT, source_ip_cidr: [DEVICE] }, MUSIC_RULE] },
        });
      });

      await test.step('a separate exact domain shows all-device scope and its real position before staging', async () => {
        await routes.simpleView.click();
        await controls.addSite.click();
        await controls.address.fill(SITE);
        await controls.select(controls.outbound, MEDIA);
        await expect(controls.form).toContainText(
          translate(SIMPLE_ROUTES_NS, 'custom.preview', {
            position: POSITION.fourth,
            scope: translate(SIMPLE_ROUTES_NS, 'custom.all'),
            outbound: MEDIA,
          })
        );
        expect(await page.evaluate<number>('document.documentElement.scrollWidth')).toBeLessThanOrEqual(PHONE.width);
        await controls.submit.click();
        await expect(controls.form).toBeHidden();
        await routes.jsonView.click();
        const edited: unknown = parse(await routes.configText.inputValue());
        expect(edited).toEqual({
          ...config,
          route: {
            rules: [
              DNS_HIJACK,
              { ...MUSIC_RULE, outbound: DIRECT, source_ip_cidr: [DEVICE] },
              MUSIC_RULE,
              { action: 'route', domain: [SITE], outbound: MEDIA },
            ],
          },
        });
      });
    }
  );

  test(
    'an unknown overlap blocks staging and preserves the imported JSONC byte for byte',
    { tag: E2E_TAG.Mock },
    async ({ page, simpleRuleControls: controls, simpleRoutesPage: routes, applyBar }) => {
      const config = { outbounds: CONFIG.outbounds, route: { rules: [IMPORTED, MUSIC_RULE] } };
      const original = withImportComment(config);
      await routes.openWithConfig(original);

      await controls.exception(MUSIC).click();
      await controls.select(controls.device, /192\.168\.1\.60/);
      await controls.select(controls.outbound, DIRECT);
      await expect(controls.submit).toBeDisabled();
      await expect(controls.form).toContainText(
        translate(SIMPLE_ROUTES_NS, 'custom.unknown', { position: POSITION.first })
      );
      await page.keyboard.press('Escape');
      await expect(applyBar.dirty).toBeHidden();
      await routes.jsonView.click();
      await expect(routes.configText).toHaveValue(original);
    }
  );
});
