import type { Page } from '@playwright/test';

import { CONFIG_DNS_EDIT_NS } from '../src/features/Config/ConfigDnsEdit/i18n/ConfigDnsEdit.namespace.generated.ts';
import { CONFIG_NODE_ADD_NS } from '../src/features/Config/ConfigNodeAdd/i18n/ConfigNodeAdd.namespace.generated.ts';
import { RULE_CATALOG_ADD_NS } from '../src/features/Rule/RuleCatalogAdd/i18n/RuleCatalogAdd.namespace.generated.ts';
import { SIMPLE_ROUTES_NS } from '../src/pages/SimpleRoutes/i18n/SimpleRoutes.namespace.generated.ts';
import { SHARED_NS } from '../src/shared/i18n/Shared.namespace.generated.ts';
import { E2E_TAG, expect, test, translate } from './fixtures/index.ts';

const CORE_VERSION = '1.14.3-extended-2.7.3';
const DESKTOP = { width: 1280, height: 800 };
const NARROW = { width: 529, height: 960 };
const TOUCH_TARGET = 44;
const JSON_INDENT = 2;
const PAIR_SELECTOR_COUNT = 2;
const PHONE = { width: 375, height: 812 };
const EXIT = 'media-exit';
const BACKUP = 'backup';
const RESOLVER = 'media-resolver';
const CATEGORY = 'youtube';
const SET_TAG = 'geosite-youtube';
const EXISTING_TAG = 'video-sites';
const FIRST_SERVER = 'first-server';
const SERVER_LINK = `vless://01234567-89ab-4cde-8123-456789abcdef@server.example.invalid:443#${FIRST_SERVER}`;
const INVALID_LEVEL = 'invalid-level';
const CHECK_OUTPUT = `FATAL invalid log level: ${INVALID_LEVEL}`;
const CONFIRM_WINDOW_MS = 60_000;
const NS_PER_MS = 1_000_000;
const SUBSCRIPTION_URL = 'https://subscription.example.invalid/synthetic-list';
const PROVIDER = 'synthetic-provider';
const GROUP = 'subscription-group';
const CHILD = `${PROVIDER}/node-a`;
const SET_URL = 'https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-youtube.srs';
const EXACT_SITE = 'youtube.com';
const HIJACK = { inbound: ['queries'], action: 'hijack-dns' };
const CONFIG = {
  inbounds: [
    { type: 'socks', tag: 'client', listen: '127.0.0.1', listen_port: 11080 },
    { type: 'direct', tag: 'queries', listen: '127.0.0.1', listen_port: 1053, network: 'udp' },
  ],
  outbounds: [
    { type: 'direct', tag: EXIT },
    { type: 'socks', tag: BACKUP, server: '192.0.2.8', server_port: 1080 },
  ],
  dns: { servers: [{ type: 'tcp', tag: RESOLVER, detour: EXIT, server: '192.0.2.53' }], rules: [] },
  route: { rules: [HIJACK] },
};

async function openEmptyApplyStand(page: Page) {
  await page.route(
    (url) => url.pathname === '/mocks/browser.ts',
    async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: `${await response.text()}
          import { DAEMON_STATUS_FIXTURE } from '/src/entities/Daemon/__tests__/Daemon.fixture.ts';
          let applied = '{}';
          let pending = applied;
          let transaction = null;
          let revision = 0;
          let sequence = 0;
          let deadline = 0;
          const hash = (value) => String(value).padStart(64, '0');
          const current = () => {
            if (transaction?.phase === 'awaiting_confirm') {
              const remaining = deadline - Date.now();
              if (remaining <= 0) {
                pending = applied;
                transaction = { ...transaction, phase: 'rolled_back', window: 0 };
              } else {
                transaction = { ...transaction, window: remaining * ${NS_PER_MS} };
              }
            }
            return transaction;
          };
          const status = () => {
            const active = current();
            return active === null ? {} : { transaction: active, transaction_href: '/api/apply/' + active.id };
          };
          const child = { name: '${CHILD}', type: 'Socks5', udp: true, history: [] };
          const provider = () => JSON.parse(applied).providers?.find(({ tag }) => tag === '${PROVIDER}');

          worker.use(
            http.get('/api/config', () => {
              const awaiting = current()?.phase === 'awaiting_confirm';
              const etag = '"' + hash(awaiting ? revision + 1 : revision) + '"';
              return HttpResponse.text(awaiting ? pending : applied, { headers: { etag } });
            }),
            http.get('/api/status', () => HttpResponse.json({
              ...DAEMON_STATUS_FIXTURE,
              core: { ...DAEMON_STATUS_FIXTURE.core, version: '${CORE_VERSION}' },
              singbox_version: '${CORE_VERSION}',
              ...status()
            })),
            http.post('/api/apply', async ({ request }) => {
              const candidate = await request.text();
              if (JSON.parse(candidate).log?.level === '${INVALID_LEVEL}') {
                return HttpResponse.json({
                  code: 'check_failed', message: 'sing-box rejected the config',
                  details: { stdout: '', stderr: '${CHECK_OUTPUT}', exit_code: 1 }
                }, { status: 422 });
              }
              pending = candidate;
              deadline = Date.now() + ${CONFIRM_WINDOW_MS};
              transaction = {
                id: 'setup-apply-' + ++sequence, phase: 'awaiting_confirm',
                window: ${CONFIRM_WINDOW_MS * NS_PER_MS}, sha256: hash(revision + 1)
              };
              return HttpResponse.json(transaction, { status: 202 });
            }),
            http.get('/api/apply/:id', () => HttpResponse.json(current())),
            http.post('/api/apply/:id/confirm', () => {
              if (current()?.phase !== 'awaiting_confirm') {
                return HttpResponse.json({ code: 'nothing_to_confirm' }, { status: 409 });
              }
              applied = pending;
              revision++;
              transaction = { ...transaction, phase: 'confirmed', window: 0 };
              return HttpResponse.json(transaction);
            }),
            http.get('/api/clash/providers/proxies', () => HttpResponse.json({ providers: provider() ? {
              '${PROVIDER}': { name: '${PROVIDER}', type: 'Proxy', vehicleType: 'HTTP', updatedAt: '2026-01-01T00:00:00Z', proxies: [child] }
            } : {} })),
            http.get('/api/clash/proxies', () => {
              const grouped = JSON.parse(applied).outbounds?.some(({ tag }) => tag === '${GROUP}');
              return HttpResponse.json({ proxies: {
                ...(provider() ? { [child.name]: child } : {}),
                ...(grouped ? { '${GROUP}': { ...child, name: '${GROUP}', type: 'Selector', all: [child.name], now: child.name } } : {})
              } });
            })
          );
        `,
      });
    }
  );
  await page.goto('/config/simple');
}

test(
  'the desktop catalog previews and stages one source-qualified route and DNS pair before Apply',
  { tag: E2E_TAG.Mock },
  async ({ page, simpleCatalog: catalog, simpleRoutesPage: routes, applyBar }, testInfo) => {
    await page.setViewportSize(DESKTOP);
    await page.addInitScript({ content: "localStorage.setItem('theme', 'light')" });
    await routes.openWithConfig(CONFIG, CORE_VERSION);
    const suggestion = routes.rules.getByRole('button', { name: 'YouTube', exact: true });
    await routes.outboundTile(BACKUP).click();
    await expect(page).toHaveURL(`/config/simple?outbound=${BACKUP}`);

    await test.step('a suggested service preselects the filtered exit and refuses an exit without matching DNS', async () => {
      await suggestion.press('Enter');
      await expect(catalog.search).toHaveValue('YouTube');
      await expect(catalog.outbound).toContainText(BACKUP);
      await expect(catalog.outbound).toHaveAccessibleDescription(translate(RULE_CATALOG_ADD_NS, 'appliedStatus'));
      await expect(catalog.dialog).toContainText(
        translate(RULE_CATALOG_ADD_NS, 'blocker.resolver', { detail: BACKUP })
      );
      await expect(
        catalog.dialog.getByText(translate(RULE_CATALOG_ADD_NS, 'allDevices'), { exact: true })
      ).toBeHidden();
      await expect(catalog.submit).toBeDisabled();
      await catalog.cancel.click();
      await expect(suggestion).toBeFocused();
      await expect(page).toHaveURL(`/config/simple?outbound=${BACKUP}`);
      await expect(applyBar.dirty).toBeHidden();
    });

    await test.step('two catalog sources offer the same service, and choosing one still leaves the draft clean', async () => {
      await suggestion.press('Enter');
      await expect(catalog.search).toBeFocused();
      await expect(catalog.service(CATEGORY, 'Runet Freedom')).toBeVisible();
      await catalog.service(CATEGORY, 'v2fly').click();
      await catalog.select(catalog.outbound, EXIT);
      await catalog.select(catalog.resolver, RESOLVER);
      await expect(catalog.submit).toBeEnabled();
      await expect(catalog.dialog).toContainText(translate(RULE_CATALOG_ADD_NS, 'preview'));
      await expect(catalog.dialog).toContainText(SET_TAG);
      await expect(catalog.dialog.getByRole('combobox')).toHaveCount(PAIR_SELECTOR_COUNT);
      await expect(
        catalog.dialog.getByRole('region', { name: translate(RULE_CATALOG_ADD_NS, 'preview') })
      ).toContainText(translate(RULE_CATALOG_ADD_NS, 'allDevices'));
      await expect(applyBar.dirty).toBeHidden();
      await page.screenshot({ path: testInfo.outputPath('catalog-desktop.png') });
    });

    await test.step('one submission returns focus to Rules and puts exactly the selected entries into the shared draft', async () => {
      await catalog.submit.press('Enter');
      await expect(catalog.dialog).toBeHidden();
      await expect(catalog.trigger).toBeFocused();
      await expect(page).toHaveURL(`/config/simple?outbound=${BACKUP}`);
      await expect(suggestion).toBeHidden();
      await expect(
        page.getByText(translate(SHARED_NS, 'toast.rule.stagedOutsideFilter', { outbound: EXIT }))
      ).toBeVisible();
      await expect(routes.rules).not.toContainText(SET_TAG);
      await routes.rules.getByRole('link', { name: translate(SIMPLE_ROUTES_NS, 'rules.clear') }).click();
      await expect(page).toHaveURL('/config/simple');
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
      await expect(applyBar.nodeChanges).toContainText(translate(SHARED_NS, 'nodeKind.dnsRules'));
      await expect(applyBar.nodeChanges).toContainText(SET_TAG);
      await expect(applyBar.confirmPrompt).toBeHidden();
    });
  }
);

test(
  'the catalog stages a pair after exact rules with the same outcome',
  { tag: E2E_TAG.Mock },
  async ({ page, simpleCatalog: catalog, simpleRoutesPage: routes, applyBar }) => {
    await page.setViewportSize(DESKTOP);
    const exactRoute = { domain: [EXACT_SITE], action: 'route', outbound: EXIT };
    const exactDns = { domain: EXACT_SITE, action: 'route', server: RESOLVER };
    const config = { ...CONFIG, route: { rules: [HIJACK, exactRoute] }, dns: { ...CONFIG.dns, rules: [exactDns] } };
    await routes.openWithConfig(config, CORE_VERSION);
    await catalog.trigger.press('Enter');
    await catalog.search.fill(CATEGORY);
    await catalog.service(CATEGORY, 'v2fly').click();
    await catalog.select(catalog.outbound, EXIT);
    await catalog.select(catalog.resolver, RESOLVER);
    await expect(catalog.submit).toBeEnabled();
    await expect(catalog.dialog).toContainText(
      translate(RULE_CATALOG_ADD_NS, 'routeRow', { position: config.route.rules.length + 1 })
    );
    await expect(catalog.dialog).toContainText(
      translate(RULE_CATALOG_ADD_NS, 'dnsRow', { position: config.dns.rules.length + 1 })
    );
    await catalog.submit.press('Enter');
    await expect(catalog.trigger).toBeFocused();
    await routes.jsonView.click();
    const staged: unknown = JSON.parse(await routes.configText.inputValue());
    expect(staged).toEqual({
      ...config,
      route: {
        rules: [HIJACK, exactRoute, { action: 'route', rule_set: [SET_TAG], outbound: EXIT }],
        rule_set: [{ type: 'remote', tag: SET_TAG, format: 'binary', url: SET_URL }],
      },
      dns: { ...config.dns, rules: [exactDns, { action: 'route', rule_set: [SET_TAG], server: RESOLVER }] },
    });
    await applyBar.apply();
    await expect(applyBar.ruleChanges).toContainText(SET_TAG);
    await expect(applyBar.nodeChanges).toContainText(translate(SHARED_NS, 'nodeKind.dnsRules'));
  }
);

for (const { grouped, viewport, theme } of [
  { grouped: false, viewport: PHONE, theme: 'dark' },
  { grouped: true, viewport: NARROW, theme: 'light' },
]) {
  const setup = grouped ? 'a group with a subscription' : 'a subscription without a group';
  test(
    `${setup} distinguishes the draft from runtime servers after confirmed Apply`,
    { tag: E2E_TAG.Mock },
    async ({ page, simpleCatalog: catalog, simpleRoutesPage: routes, applyBar }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.addInitScript((value) => {
        localStorage.setItem('theme', value);
      }, theme);
      await openEmptyApplyStand(page);
      const suggestion = routes.rules.getByRole('button', { name: 'Discord', exact: true });
      const pending = translate(RULE_CATALOG_ADD_NS, 'subscriptionPending');
      const count = translate(RULE_CATALOG_ADD_NS, grouped ? 'subscriptionGroupLoaded' : 'subscriptionLoaded', {
        count: 1,
      });
      const blocker = translate(RULE_CATALOG_ADD_NS, 'blocker.subscriptionExit', { detail: GROUP });

      await routes.addFromStarter.press('Enter');
      await routes.serverLink.fill(SUBSCRIPTION_URL);
      await routes.subscriptionTag.fill(PROVIDER);
      if (grouped) {
        await routes.selectSubscriptionGroup(translate(CONFIG_NODE_ADD_NS, 'subscription.newGroup'));
        await routes.dialog
          .getByRole('textbox', { name: translate(CONFIG_NODE_ADD_NS, 'subscription.groupName') })
          .fill(GROUP);
      }
      await routes.stageSubscription.press('Enter');
      await expect(routes.addFromOutbounds).toBeFocused();
      await expect(routes.outbounds).toContainText(translate(SIMPLE_ROUTES_NS, 'outbounds.providers', { count: 1 }));
      await expect(routes.outboundTile(PROVIDER)).toHaveCount(0);
      await suggestion.press('Enter');
      await expect(catalog.search).toHaveValue('Discord');
      await expect(catalog.dialog).toContainText(pending);
      await expect(catalog.dialog).not.toContainText(count);
      await expect(catalog.submit).toBeDisabled();
      if (grouped) {
        await expect(catalog.outbound).toContainText(GROUP);
        await expect(catalog.outbound).toHaveAccessibleDescription(translate(RULE_CATALOG_ADD_NS, 'stagedStatus'));
        await expect(catalog.dialog).toContainText(blocker);
      } else {
        await expect(catalog.outbound).toBeDisabled();
      }
      await page.screenshot({ path: testInfo.outputPath('subscription-staged.png') });
      await catalog.cancel.click();
      await expect(suggestion).toBeFocused();
      await routes.jsonView.click();
      const beforeApply = await routes.configText.inputValue();
      await routes.simpleView.click();
      await applyBar.apply();
      await applyBar.confirmDiff();
      await expect(applyBar.confirmPrompt).toBeVisible();
      await suggestion.press('Enter');
      await expect(catalog.dialog).toContainText(pending);
      await expect(catalog.dialog).not.toContainText(count);
      await page.keyboard.press('Escape');
      await expect(suggestion).toBeFocused();
      await applyBar.keep();

      await expect(applyBar.dirty).toBeHidden();
      await suggestion.press('Enter');
      await expect(catalog.dialog).toContainText(count);
      await expect(catalog.dialog).not.toContainText(pending);
      await expect(catalog.submit).toBeDisabled();
      if (grouped) {
        await expect(catalog.outbound).toHaveAccessibleDescription(translate(RULE_CATALOG_ADD_NS, 'appliedStatus'));
        await expect(catalog.dialog).toContainText(blocker);
        await catalog.outbound.press('Enter');
        await expect(page.getByRole('option')).toHaveText([GROUP]);
        await page.keyboard.press('Escape');
      } else {
        await expect(catalog.outbound).toBeDisabled();
      }
      await page.screenshot({ path: testInfo.outputPath('subscription-applied.png') });
      await catalog.cancel.click();
      await expect(suggestion).toBeFocused();
      await expect(routes.outboundTile(CHILD)).toHaveCount(0);
      await routes.jsonView.click();
      await expect(routes.configText).toHaveValue(beforeApply);
    }
  );
}

test(
  'from an empty config, the first server and service share validation, confirmation and rollback',
  { tag: E2E_TAG.Mock },
  async ({ page, simpleCatalog: catalog, simpleRoutesPage: routes, simpleDns: dns, applyBar }, testInfo) => {
    await page.setViewportSize(DESKTOP);
    await page.addInitScript({ content: "localStorage.setItem('theme', 'light')" });
    await page.clock.install();
    await openEmptyApplyStand(page);
    await routes.starter.waitFor();
    const suggestion = routes.rules.getByRole('button', { name: 'YouTube', exact: true });
    const findAnother = routes.rules.getByRole('button', { name: translate(SIMPLE_ROUTES_NS, 'catalog.findAnother') });
    const tile = routes.outboundTile(FIRST_SERVER);

    for (const name of ['YouTube', 'Discord', 'GitHub']) {
      await expect(routes.rules.getByRole('button', { name, exact: true })).toBeVisible();
    }
    await findAnother.press('Enter');
    await expect(catalog.search).toBeFocused();
    await expect(catalog.search).toHaveValue('');
    await catalog.cancel.press('Enter');
    await expect(findAnother).toBeFocused();
    await expect(applyBar.dirty).toBeHidden();

    await routes.addFromStarter.press('Enter');
    await routes.serverLink.fill(SERVER_LINK);
    await routes.addServer.press('Enter');
    await expect(routes.addFromOutbounds).toBeFocused();
    await expect(tile).toContainText(translate(SIMPLE_ROUTES_NS, 'outbounds.staged'));
    await expect(suggestion).toBeVisible();
    await page.setViewportSize(PHONE);
    await routes.outbounds
      .getByRole('link', { name: translate(SIMPLE_ROUTES_NS, 'outbounds.serviceSuggestions') })
      .press('Enter');
    await expect(suggestion).toBeInViewport();
    await page.keyboard.press('Tab');
    await expect(suggestion).toBeFocused();
    await page.setViewportSize(DESKTOP);
    await routes.jsonView.click();
    await expect(routes.configText).toHaveValue(new RegExp(FIRST_SERVER));
    const serverDraft = await routes.configText.inputValue();
    await routes.editorView.click();
    await routes.editorOutbounds.click();
    await expect(page.getByText(FIRST_SERVER, { exact: true })).toBeVisible();
    await routes.simpleView.click();
    await tile.press('Enter');
    await expect(page).toHaveURL(`/config/simple?outbound=${FIRST_SERVER}`);
    await suggestion.evaluate('(button) => button.scrollIntoView({ block: "center" })');
    const position = await suggestion.boundingBox();
    await suggestion.press('Enter');
    await expect(catalog.search).toHaveValue('YouTube');
    await expect(catalog.service(CATEGORY, 'v2fly')).toBeVisible();
    await expect(catalog.outbound).toContainText(FIRST_SERVER);
    await expect(catalog.outbound).toHaveAccessibleDescription(translate(RULE_CATALOG_ADD_NS, 'stagedStatus'));
    await expect(catalog.dialog).toContainText(
      translate(RULE_CATALOG_ADD_NS, 'blocker.exit', { detail: FIRST_SERVER })
    );
    await expect(catalog.submit).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath('first-server-staged.png') });
    await page.keyboard.press('Escape');
    await expect(suggestion).toBeFocused();
    expect((await suggestion.boundingBox())?.y).toBe(position?.y);
    await expect(page).toHaveURL(`/config/simple?outbound=${FIRST_SERVER}`);
    await routes.jsonView.click();
    await expect(routes.configText).toHaveValue(serverDraft);

    await test.step('a failed core check keeps the same draft across the three views', async () => {
      const invalid = serverDraft.replace('{', `{\n  "log": {"level": "${INVALID_LEVEL}"},`);
      await routes.configText.fill(invalid);
      await routes.simpleView.click();
      await applyBar.apply();
      await expect(applyBar.nodeChanges).toContainText(FIRST_SERVER);
      await applyBar.confirmDiff();
      await expect(applyBar.checkFailure).toBeVisible();
      await expect(applyBar.region).toContainText(CHECK_OUTPUT);
      await expect(applyBar.confirmPrompt).toBeHidden();
      await routes.editorView.click();
      await routes.editorOutbounds.click();
      await expect(page.getByText(FIRST_SERVER, { exact: true })).toBeVisible();
      await routes.jsonView.click();
      await expect(routes.configText).toHaveValue(invalid);
    });

    await test.step('repair the draft and explicitly keep the first server', async () => {
      await routes.configText.fill(serverDraft);
      await routes.simpleView.click();
      await applyBar.apply();
      await applyBar.confirmDiff();
      await expect(applyBar.confirmPrompt).toBeVisible();
      await expect(tile).toContainText(translate(SIMPLE_ROUTES_NS, 'outbounds.staged'));
      await applyBar.keep();

      await expect(applyBar.confirmed).toBeVisible();
      await expect(tile).toContainText(translate(SIMPLE_ROUTES_NS, 'outbounds.applied'));
      await expect(applyBar.dirty).toBeHidden();
      await suggestion.press('Enter');
      await expect(catalog.outbound).toHaveAccessibleDescription(translate(RULE_CATALOG_ADD_NS, 'appliedStatus'));
      await expect(catalog.dialog).toContainText(
        translate(RULE_CATALOG_ADD_NS, 'blocker.exit', { detail: FIRST_SERVER })
      );
      await expect(catalog.submit).toBeDisabled();
      await catalog.cancel.press('Enter');
    });

    await test.step('stage the first service after explicitly configuring eligible ingress, exit and DNS', async () => {
      const saved: unknown = JSON.parse(serverDraft);
      if (typeof saved !== 'object' || saved === null || !('outbounds' in saved) || !Array.isArray(saved.outbounds)) {
        throw new Error('The first server is missing from the saved outbounds');
      }
      const outbounds: unknown[] = saved.outbounds;
      const compatible = { ...saved, ...CONFIG, outbounds: [...outbounds, ...CONFIG.outbounds] };
      await routes.jsonView.click();
      await routes.configText.fill(JSON.stringify(compatible, null, JSON_INDENT));
      await routes.simpleView.click();
      await suggestion.press('Enter');
      await catalog.service(CATEGORY, 'v2fly').press('Space');
      const stagedStatus = translate(RULE_CATALOG_ADD_NS, 'stagedStatus');
      await catalog.select(catalog.outbound, `${EXIT} · ${stagedStatus}`);
      await expect(catalog.outbound).toHaveAccessibleDescription(stagedStatus);
      await catalog.select(catalog.resolver, RESOLVER);
      await expect(catalog.dialog).toContainText(translate(RULE_CATALOG_ADD_NS, 'routeRow', { position: 2 }));
      await expect(catalog.dialog).toContainText(translate(RULE_CATALOG_ADD_NS, 'dnsRow', { position: 1 }));
      await catalog.submit.press('Enter');
      await expect(catalog.trigger).toBeFocused();

      await dns.settings.press('Enter');
      await dns.advanced.press('Enter');
      await dns.select(dns.family, translate(CONFIG_DNS_EDIT_NS, 'options.strategy.prefer_ipv6'));
      await routes.jsonView.click();
      const staged: unknown = JSON.parse(await routes.configText.inputValue());
      expect(staged).toEqual({
        ...compatible,
        route: {
          rules: [HIJACK, { action: 'route', rule_set: [SET_TAG], outbound: EXIT }],
          rule_set: [{ type: 'remote', tag: SET_TAG, format: 'binary', url: SET_URL }],
        },
        dns: {
          ...compatible.dns,
          strategy: 'prefer_ipv6',
          rules: [{ action: 'route', rule_set: [SET_TAG], server: RESOLVER }],
        },
      });
    });

    await test.step('the pair appears together in the diff and a missed confirmation restores the saved config', async () => {
      const staged = await routes.configText.inputValue();
      await routes.simpleView.click();
      await applyBar.apply();
      await expect(applyBar.ruleChanges).toContainText(SET_TAG);
      await expect(applyBar.nodeChanges).toContainText(translate(SHARED_NS, 'nodeKind.dnsRules'));
      await expect(applyBar.nodeChanges).toContainText(SET_TAG);
      await applyBar.showChangesText();
      await expect(applyBar.diff).toContainText(new RegExp(`"outbound":\\s*"${EXIT}"`));
      await expect(applyBar.diff).toContainText(new RegExp(`"server":\\s*"${RESOLVER}"`));
      await expect(applyBar.diff).toContainText('prefer_ipv6');
      await applyBar.confirmDiff();
      await expect(applyBar.confirmPrompt).toBeVisible();
      await routes.jsonView.click();
      await expect(applyBar.confirmPrompt).toBeVisible();
      await page.clock.fastForward(CONFIRM_WINDOW_MS);
      await expect(applyBar.rolledBack).toBeVisible();
      await expect(applyBar.keepButton).toBeHidden();
      await expect(routes.configText).toHaveValue(staged);
      await expect(applyBar.dirty).toBeVisible();
      await expect(tile).toBeHidden();
      await routes.simpleView.click();
      await expect(tile).toContainText(translate(SIMPLE_ROUTES_NS, 'outbounds.applied'));
      await expect(routes.outboundTile(EXIT)).toContainText(translate(SIMPLE_ROUTES_NS, 'outbounds.staged'));
      await applyBar.apply();
      await expect(applyBar.ruleChanges).toContainText(SET_TAG);
      await expect(applyBar.nodeChanges).toContainText(translate(SHARED_NS, 'nodeKind.dnsRules'));
      await expect(applyBar.nodeChanges).not.toContainText(FIRST_SERVER);
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
      await expect(catalog.dialog).toContainText(translate(RULE_CATALOG_ADD_NS, 'dnsRow', { position: 1 }));
      await expect(catalog.dialog).toContainText(translate(RULE_CATALOG_ADD_NS, 'reused'));
      await expect(catalog.resolver).toContainText(RESOLVER);
      await expect(
        catalog.dialog.getByRole('region', { name: translate(RULE_CATALOG_ADD_NS, 'preview') })
      ).toContainText(translate(RULE_CATALOG_ADD_NS, 'allDevices'));
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
      await expect(catalog.dialog).toContainText(translate(RULE_CATALOG_ADD_NS, 'blocker.dnsConflict', { detail: 1 }));
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
      await expect(catalog.dialog.getByRole('combobox')).toHaveCount(1);
      await expect(
        catalog.dialog.getByText(translate(RULE_CATALOG_ADD_NS, 'allDevices'), { exact: true })
      ).toBeHidden();
      await catalog.search.press('d');
      await expect(catalog.search).toHaveValue('d');
      await page.keyboard.press('Escape');
      await expect(suggestion).toBeFocused();
      await expect(applyBar.dirty).toBeHidden();
    }
  );
});
