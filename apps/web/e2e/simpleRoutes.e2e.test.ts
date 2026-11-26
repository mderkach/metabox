import { E2E_TAG, expect, test, translate } from './fixtures/index.ts';
import { SIMPLE_SECTION_HEADINGS } from './pages/SimpleRoutesPage.ts';

const SERVER = 'simple-routes-server';
const UUID = '01234567-89ab-4cde-8123-456789abcdef';
const LINK = `vless://${UUID}@server.example.invalid:443#${SERVER}`;
const DIRECT = 'direct';
const DIRECT_RULE = 'home.example.com';
const OTHER_RULE = 'docs.example.com';
const SIMPLE_ROUTES = 'pages/SimpleRoutes';
const NODE_ADD = 'features/Config/ConfigNodeAdd';
const STAND_COUNTS = { inbounds: 3, dnsResolvers: 11, dnsRules: 12 };
const DESKTOP = { width: 1280, height: 600 };
const PHONE = { width: 375, height: 812 };
const NARROW = { width: 529, height: 1170 };
const MOCK_VERSION_COUNT = 2;
const HALF = 0.5;

function saveTheme(theme: string) {
  localStorage.setItem('theme', theme);
}

test(
  'Simple, Editor and JSON share the server draft and its Apply flow',
  { tag: E2E_TAG.Mock },
  async ({ page, simpleRoutesPage: routes, applyBar }) => {
    const applyRequests: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/apply') {
        applyRequests.push(request.postData() ?? '');
      }
    });
    await page.setViewportSize(DESKTOP);
    await page.addInitScript(saveTheme, 'light');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await routes.goto(DIRECT);

    await test.step('the four sections show the populated draft and the linked outbound filter', async () => {
      await expect(routes.sectionHeadings).toHaveText(SIMPLE_SECTION_HEADINGS);
      await expect(routes.interception).toContainText(translate(SIMPLE_ROUTES, 'interception.listed'));
      await expect(routes.interception).toContainText(
        translate(SIMPLE_ROUTES, 'interception.inbounds', { count: STAND_COUNTS.inbounds })
      );
      await expect(routes.dns).toContainText(
        translate(SIMPLE_ROUTES, 'dns.servers', { count: STAND_COUNTS.dnsResolvers })
      );
      await expect(routes.dns).toContainText(translate(SIMPLE_ROUTES, 'dns.rules', { count: STAND_COUNTS.dnsRules }));
      await expect(routes.outbounds).toContainText(DIRECT);
      await expect(routes.rules).toContainText(DIRECT_RULE);
      await expect(routes.rules).not.toContainText(OTHER_RULE);
      await expect(routes.starter).toBeHidden();
      await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
      expect(await page.evaluate<number>('document.documentElement.scrollWidth')).toBeLessThanOrEqual(DESKTOP.width);
    });

    await test.step('the Simple header groups the title, views and actions without the config path', async () => {
      await expect(routes.configPath).toBeHidden();
      await expect(routes.views).toBeVisible();
      await expect(routes.openHistory).toBeVisible();
      await expect(routes.routingMode).toBeVisible();
      const bounds = await Promise.all(
        [routes.title, routes.views, routes.openHistory, routes.addFromHeader].map(async (locator) =>
          locator.boundingBox()
        )
      );
      const centers = bounds.flatMap((box) => (box === null ? [] : [box.y + box.height * HALF]));
      expect(centers).toHaveLength(bounds.length);
      expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(1);

      await routes.addFromHeader.press('Enter');
      await expect(routes.dialog).toBeVisible();
      await expect(routes.serverLink).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(routes.dialog).toBeHidden();
      await expect(routes.addFromHeader).toBeFocused();
      await expect(applyBar.dirty).toBeHidden();
    });

    await test.step('an outbound tile toggles the same rule filter as the incoming link', async () => {
      const tile = routes.outboundTile(DIRECT);
      await expect(tile).toHaveAttribute('aria-pressed', 'true');
      await tile.press('Enter');
      await expect(page).toHaveURL('/config/simple');
      await expect(tile).toHaveAttribute('aria-pressed', 'false');
      await expect(routes.rules).toContainText(OTHER_RULE);

      await tile.press('Enter');
      await expect(page).toHaveURL('/config/simple?outbound=direct');
      await expect(tile).toBeFocused();
      await expect(routes.rules).toContainText(DIRECT_RULE);
      await expect(routes.rules).not.toContainText(OTHER_RULE);
      await expect(applyBar.dirty).toBeHidden();
    });

    await test.step('Escape preserves the rule filter, scroll position and trigger focus', async () => {
      await routes.addFromOutbounds.evaluate('(button) => button.scrollIntoView({ block: "center" })');
      const before = await routes.addFromOutbounds.boundingBox();
      await routes.addFromOutbounds.press('Enter');
      await expect(routes.dialog).toBeVisible();
      await routes.serverLink.fill(LINK);
      await page.keyboard.press('Escape');

      await expect(routes.dialog).toBeHidden();
      await expect(routes.addFromOutbounds).toBeFocused();
      const after = await routes.addFromOutbounds.boundingBox();
      expect(after).not.toBeNull();
      expect(after?.y).toBe(before?.y);
      await expect(page).toHaveURL('/config/simple?outbound=direct');
      await expect(routes.rules).toContainText(DIRECT_RULE);
      await expect(routes.rules).not.toContainText(OTHER_RULE);
      await expect(routes.outbounds).not.toContainText(SERVER);
      await expect(applyBar.dirty).toBeHidden();
    });

    await test.step('adding a server stays on Simple and stages it', async () => {
      await routes.addFromOutbounds.click();
      await routes.stageServer(LINK);

      await expect(routes.dialog).toBeHidden();
      await expect(routes.addFromOutbounds).toBeFocused();
      await expect(routes.outbounds).toContainText(SERVER);
      await expect(applyBar.dirty).toBeVisible();
    });

    await test.step('keyboard navigation visits Editor and JSON with the edit still pending', async () => {
      await routes.simpleView.press('ArrowRight');
      await expect(routes.editorView).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL('/config');
      await expect(routes.configPath).toBeVisible();
      await expect(routes.addFromHeader).toBeHidden();

      await routes.editorOutbounds.click();
      await expect(page).toHaveURL('/config/outbounds');
      await expect(page.getByRole('button', { name: SERVER, exact: true })).toBeVisible();

      await routes.editorView.press('ArrowRight');
      await expect(routes.jsonView).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL('/config/raw');
      await expect(routes.configPath).toBeVisible();
      await expect(routes.configText).toHaveValue(new RegExp(`"tag":\\s*"${SERVER}"`));

      await routes.jsonView.press('Home');
      await expect(routes.simpleView).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/\/config\/simple(?:\?.*)?$/);
      await expect(routes.outbounds).toContainText(SERVER);
      await expect(applyBar.dirty).toBeVisible();
      expect(applyRequests).toHaveLength(0);
    });

    await test.step('history opens separately, and Apply sends the staged change shown in the difference', async () => {
      await routes.openHistory.click();
      await expect(routes.history).toBeVisible();
      await expect(routes.history.getByRole('listitem')).toHaveCount(MOCK_VERSION_COUNT);
      await page.keyboard.press('Escape');
      await expect(routes.history).toBeHidden();

      await applyBar.apply();
      await expect(applyBar.nodeChanges).toContainText(SERVER);
      expect(applyRequests).toHaveLength(0);
      await applyBar.confirmDiff();

      await expect(applyBar.confirmPrompt).toBeVisible();
      expect(applyRequests).toHaveLength(1);
      expect(applyRequests[0]).toContain(SERVER);
    });
  }
);

for (const viewport of [NARROW, DESKTOP]) {
  test(
    `Routes keeps common controls across Simple, Editor and JSON at ${String(viewport.width)}px`,
    { tag: E2E_TAG.Mock },
    async ({ page, simpleRoutesPage: routes, applyBar }) => {
      await page.setViewportSize(viewport);
      await routes.goto(DIRECT);
      await expect(routes.routingMode).toContainText(translate('shared', 'clashMode.rule'));
      await routes.routingMode.click();
      await page.getByRole('option', { name: translate('shared', 'clashMode.direct'), exact: true }).click();
      await expect(routes.routingMode).toContainText(translate('shared', 'clashMode.direct'));
      await expect(applyBar.dirty).toBeHidden();
      await routes.addFromHeader.click();
      await routes.stageServer(LINK);
      await expect(applyBar.dirty).toBeVisible();

      const commonControls = [routes.views, routes.routingMode, routes.openHistory];
      const bounds = await Promise.all(commonControls.map(async (control) => control.boundingBox()));
      if (viewport === NARROW) {
        const tabs = [routes.simpleView, routes.editorView, routes.jsonView];
        const tabWidths = await Promise.all(tabs.map(async (tab) => (await tab.boundingBox())?.width ?? 0));
        expect(Math.max(...tabWidths) - Math.min(...tabWidths)).toBeLessThanOrEqual(1);
        const tile = await routes.outboundTile(DIRECT).boundingBox();
        expect(tile?.width).toBe(bounds[0]?.width);
        expect(tile?.x).toBe(bounds[0]?.x);
      }

      await routes.editorView.click();
      await expect(page).toHaveURL('/config');
      await expect(routes.routingSettings).toHaveAttribute('aria-expanded', 'false');
      await routes.routingSettings.press('Enter');
      await expect(routes.routingSettings).toHaveAttribute('aria-expanded', 'true');
      await expect(routes.routingMode).toContainText(translate('shared', 'clashMode.direct'));
      expect(await Promise.all(commonControls.map(async (control) => control.boundingBox()))).toEqual(bounds);

      await routes.jsonView.click();
      await expect(page).toHaveURL('/config/raw');
      await expect(routes.configPath).toBeVisible();
      await expect(routes.routingMode).toContainText(translate('shared', 'clashMode.direct'));
      expect(await Promise.all(commonControls.map(async (control) => control.boundingBox()))).toEqual(bounds);
    }
  );
}

const HELP_SCENARIOS = [
  { touch: false, title: 'Simple help and version history preserve the draft (keyboard)' },
  { touch: true, title: 'Simple help and version history preserve the draft (touch)' },
];

for (const { touch, title } of HELP_SCENARIOS) {
  test.describe(touch ? 'Simple help by touch' : 'Simple help by keyboard', () => {
    test.use({
      hasTouch: touch,
      viewport: touch ? PHONE : DESKTOP,
      reducedMotion: touch ? 'reduce' : 'no-preference',
    });

    test(title, { tag: E2E_TAG.Mock }, async ({ page, simpleRoutesPage: routes, applyBar }) => {
      await page.addInitScript(saveTheme, touch ? 'dark' : 'light');
      await routes.goto(DIRECT);
      await routes.addFromOutbounds.click();
      await routes.stageServer(LINK);
      await expect(routes.dialog).toBeHidden();
      await expect(routes.addFromOutbounds).toBeFocused();
      await expect(applyBar.dirty).toBeVisible();

      await test.step('short help stays at its anchor without moving the surrounding content', async () => {
        const trigger = routes.dnsHelpButton;
        const popup = routes.dnsHelp;
        await trigger.scrollIntoViewIfNeeded();
        const before = await routes.outbounds.boundingBox();
        if (touch) await trigger.tap();
        else await trigger.press('Enter');

        await expect(popup).toHaveAccessibleDescription(translate(SIMPLE_ROUTES, 'help.dns'));
        await expect(popup).toBeInViewport({ ratio: 1 });
        await expect.poll(async () => routes.outbounds.boundingBox()).toEqual(before);
        if (touch) {
          await expect(popup).toHaveCSS('animation-name', 'none');
          await routes.title.tap();
        } else {
          await page.keyboard.press('Escape');
          await expect(trigger).toBeFocused();
        }
        await expect(popup).toBeHidden();

        if (touch) await trigger.tap();
        else await trigger.press('Space');
        await expect(popup).toBeFocused();
        await trigger.hover();
        await page.mouse.wheel(0, touch ? PHONE.height : DESKTOP.height);
        await expect(trigger).not.toBeInViewport();
        await expect(trigger).toHaveAttribute('aria-expanded', 'false');
        await expect(popup).toBeHidden();
        await expect(applyBar.dirty).toBeVisible();
      });

      await test.step('version history opens the existing list and preserves the scroll position', async () => {
        const before = await routes.rules.boundingBox();
        await expect(routes.openHistory).toHaveCount(1);
        if (touch) await routes.openHistory.tap();
        else await routes.openHistory.press('Enter');

        await expect(routes.history.getByRole('listitem')).toHaveCount(MOCK_VERSION_COUNT);
        if (touch) await routes.closeHistory.tap();
        else await page.keyboard.press('Escape');
        await expect(routes.history).toBeHidden();
        await expect(routes.openHistory).toBeFocused();
        await expect.poll(async () => routes.rules.boundingBox()).toEqual(before);
        await expect(routes.outbounds).toContainText(SERVER);
        await expect(applyBar.dirty).toBeVisible();
      });

      await test.step('the route explanation expands in place and links to connection examples', async () => {
        await routes.openRouteHelp.scrollIntoViewIfNeeded();
        await expect(routes.routeExamples).toBeHidden();
        const before = await routes.interception.boundingBox();
        expect(before).not.toBeNull();
        if (touch) await routes.openRouteHelp.tap();
        else await routes.openRouteHelp.press('Space');

        await expect(routes.routeExamples).toHaveAttribute('href', '/how-it-works');
        await expect(routes.routeExamples).toBeVisible();
        await expect.poll(async () => (await routes.interception.boundingBox())?.y).toBeGreaterThan(before?.y ?? 0);
        if (touch) await routes.openRouteHelp.tap();
        else await routes.openRouteHelp.press('Enter');
        await expect(routes.routeExamples).toBeHidden();
        await expect.poll(async () => routes.interception.boundingBox()).toEqual(before);
        await expect(applyBar.dirty).toBeVisible();
      });
    });
  });
}

const EMPTY_CONFIGS = [
  { theme: 'light', config: {} },
  { theme: 'dark', config: { dns: { servers: [], rules: [] }, outbounds: [], route: { rules: [] } } },
] as const;

for (const { theme, config } of EMPTY_CONFIGS) {
  test(
    `the empty Simple view opens the same focused server dialog from both actions in ${theme} theme`,
    { tag: E2E_TAG.Mock },
    async ({ page, simpleRoutesPage: routes, applyBar }) => {
      await page.setViewportSize(PHONE);
      await page.addInitScript(saveTheme, theme);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await routes.openWithConfig(config);

      await test.step('the empty document leads to the starter and four sections without sideways overflow', async () => {
        await expect(page).toHaveURL('/config/simple');
        await expect(routes.starter).toBeVisible();
        await expect(routes.sectionHeadings).toHaveText(SIMPLE_SECTION_HEADINGS);
        await expect(routes.interception).toContainText(translate(SIMPLE_ROUTES, 'interception.listed'));
        await expect(routes.interception).toContainText(
          translate(SIMPLE_ROUTES, 'interception.inbounds', { count: 0 })
        );
        await expect(routes.dns).toContainText(translate(SIMPLE_ROUTES, 'dns.servers', { count: 0 }));
        await expect(routes.dns).toContainText(translate(SIMPLE_ROUTES, 'dns.finalUnknown'));
        await expect(routes.outbounds).toContainText(translate(SIMPLE_ROUTES, 'outbounds.empty'));
        await expect(routes.rules).toContainText(translate(SIMPLE_ROUTES, 'rules.empty'));
        await expect(page.locator('html')).toHaveCSS('color-scheme', theme);
        expect(await page.evaluate<number>('document.documentElement.scrollWidth')).toBeLessThanOrEqual(PHONE.width);
      });

      await test.step('both triggers open the same dialog and cancellation returns to the trigger', async () => {
        for (const trigger of [routes.addFromStarter, routes.addFromOutbounds]) {
          await trigger.click();
          await expect(routes.dialog).toBeVisible();
          await expect(routes.serverLink).toBeFocused();
          expect(
            await routes.dialog.evaluate(
              (element: { scrollWidth: number; clientWidth: number }) => element.scrollWidth - element.clientWidth
            )
          ).toBeLessThanOrEqual(0);

          await routes.serverLink.fill(LINK);
          await routes.cancel.click();
          await expect(routes.dialog).toBeHidden();
          await expect(trigger).toBeFocused();
          await expect(applyBar.dirty).toBeHidden();
        }
      });

      await test.step('an HTTP address offers manual entry in the existing editor section', async () => {
        await routes.addFromStarter.click();
        await routes.serverLink.fill('http://subscription.example.invalid/list');
        await expect(routes.subscription).toHaveAttribute('href', '/config/providers');
        await routes.subscription.click();
        await expect(page).toHaveURL('/config/providers');
        await expect(routes.dialog).toBeHidden();
        await expect(routes.addSubscription).toBeVisible();
        await routes.simpleView.click();
        await expect(routes.starter).toBeVisible();
      });

      await test.step('the starter can add the first outbound to the same draft', async () => {
        await routes.addFromStarter.click();
        await routes.stageServer(LINK);
        await expect(routes.dialog).toBeHidden();
        await expect(routes.addFromOutbounds).toBeFocused();
        await expect(routes.outbounds).toContainText(SERVER);
        await expect(applyBar.dirty).toBeVisible();

        await applyBar.apply();
        await expect(applyBar.nodeChanges).toContainText(SERVER);
      });
    }
  );
}

const SUBSCRIPTION_HOST = 'subscription.example.invalid';
const SUBSCRIPTION_TOKEN = 'fake-subscription-token';
const SUBSCRIPTION_URL = `https://${SUBSCRIPTION_HOST}/list?token=${SUBSCRIPTION_TOKEN}`;
const EXISTING_TAG = 'existing-subscription';
const STAGED_TAG = 'new-subscription';
const RULE_SET_TAG = 'catalog';
const GROUP_TAG = 'proxy-group';
const USER_AGENT = 'ExampleClient/1.0';
const CUSTOM_INTERVAL_DAYS = 2;
const MOBILE_INTERVAL_HOURS = 3;
const ORIGINAL_SUBSCRIPTION = {
  type: 'remote',
  tag: EXISTING_TAG,
  url: SUBSCRIPTION_URL,
  user_agent: USER_AGENT,
  update_interval: '15m',
};
const POPULATED_CONFIG = {
  providers: [ORIGINAL_SUBSCRIPTION],
  outbounds: [{ type: 'selector', tag: GROUP_TAG, providers: [EXISTING_TAG] }],
  route: { rule_set: [{ type: 'inline', tag: RULE_SET_TAG, rules: [{ domain_suffix: ['example.com'] }] }] },
};

test(
  'Simple stages a second subscription at the same URL and rejects applied and staged tag conflicts',
  { tag: E2E_TAG.Mock },
  async ({ page, simpleRoutesPage: routes, applyBar }) => {
    const subscriptionRequests: string[] = [];
    await page.route(
      (url) => url.hostname === SUBSCRIPTION_HOST,
      async (route) => route.abort()
    );
    const applyRequests: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.hostname === SUBSCRIPTION_HOST) subscriptionRequests.push(url.hostname);
      if (request.method() === 'POST' && url.pathname === '/api/apply') {
        applyRequests.push(request.postData() ?? '');
      }
    });
    await page.setViewportSize(DESKTOP);
    await page.addInitScript(saveTheme, 'light');
    await routes.openWithConfig(POPULATED_CONFIG);

    await test.step('an unverified URL opens subscription fields and leaves the draft clean', async () => {
      await routes.addFromOutbounds.press('Enter');
      await expect(routes.serverLink).toBeFocused();
      await routes.serverLink.fill(SUBSCRIPTION_URL);

      await expect(routes.subscriptionNotice).toBeVisible();
      await expect(routes.subscription).toBeHidden();
      await expect(routes.dialog).not.toContainText(SUBSCRIPTION_TOKEN);
      await expect(applyBar.dirty).toBeHidden();
      expect(subscriptionRequests).toHaveLength(0);
      expect(applyRequests).toHaveLength(0);
    });

    await test.step('an applied rule-set tag blocks staging and preserves the other fields', async () => {
      await routes.subscriptionTag.fill(RULE_SET_TAG);
      await routes.selectSubscriptionGroup(GROUP_TAG);
      await routes.setSubscriptionInterval(CUSTOM_INTERVAL_DAYS, 'days');
      await routes.selectSubscriptionAgent('customAgent');
      await routes.subscriptionAgentValue.fill(USER_AGENT);
      await routes.stageSubscription.click();

      await expect(routes.subscriptionTagError).toBeVisible();
      await expect(routes.subscriptionTag).toHaveAttribute('aria-invalid', 'true');
      await expect(routes.serverLink).toHaveValue(SUBSCRIPTION_URL);
      await expect(routes.subscriptionGroup).toContainText(GROUP_TAG);
      await expect(routes.subscriptionIntervalValue).toHaveValue(String(CUSTOM_INTERVAL_DAYS));
      await expect(routes.subscriptionIntervalUnit).toContainText(translate(NODE_ADD, 'subscription.days'));
      await expect(routes.subscriptionAgentValue).toHaveValue(USER_AGENT);
      await expect(routes.dialog).not.toContainText(SUBSCRIPTION_TOKEN);
      await expect(applyBar.dirty).toBeHidden();
    });

    await test.step('a free tag allows the ordinary Add action with the same URL and User-Agent', async () => {
      await routes.subscriptionTag.fill(STAGED_TAG);
      await routes.stageSubscription.click();

      await expect(routes.dialog).toBeHidden();
      await expect(routes.addFromOutbounds).toBeFocused();
      await expect(routes.outbounds).toContainText(translate(SIMPLE_ROUTES, 'outbounds.providers', { count: 2 }));
      await expect(applyBar.dirty).toBeVisible();
      expect(subscriptionRequests).toHaveLength(0);
      expect(applyRequests).toHaveLength(0);
    });

    await test.step('a tag staged moments ago also blocks another addition', async () => {
      await routes.addFromOutbounds.click();
      await routes.serverLink.fill(SUBSCRIPTION_URL);
      await routes.subscriptionTag.fill(STAGED_TAG);
      await routes.stageSubscription.click();

      await expect(routes.subscriptionTagError).toBeVisible();
      await expect(routes.serverLink).toHaveValue(SUBSCRIPTION_URL);
      await routes.cancel.click();
      await expect(routes.dialog).toBeHidden();
      await expect(routes.addFromOutbounds).toBeFocused();
      await expect(routes.outbounds).toContainText(translate(SIMPLE_ROUTES, 'outbounds.providers', { count: 2 }));
    });

    await test.step('only confirming Apply sends the original and newly staged settings to the mock daemon', async () => {
      await applyBar.apply();
      await expect(applyBar.nodeChanges).toContainText(STAGED_TAG);
      await applyBar.showChangesText();
      await expect(applyBar.diff).toContainText(`${SUBSCRIPTION_HOST}/••••••`);
      await expect(applyBar.diff).not.toContainText(SUBSCRIPTION_TOKEN);
      expect(subscriptionRequests).toHaveLength(0);
      expect(applyRequests).toHaveLength(0);

      await applyBar.confirmDiff();
      await expect(applyBar.confirmPrompt).toBeVisible();

      expect(applyRequests).toHaveLength(1);
      expect(JSON.parse(applyRequests[0])).toMatchObject({
        providers: [
          ORIGINAL_SUBSCRIPTION,
          { ...ORIGINAL_SUBSCRIPTION, tag: STAGED_TAG, update_interval: `${CUSTOM_INTERVAL_DAYS}d` },
        ],
        outbounds: [{ type: 'selector', tag: GROUP_TAG, providers: [EXISTING_TAG, STAGED_TAG] }],
        route: POPULATED_CONFIG.route,
      });
      expect(subscriptionRequests).toHaveLength(0);
    });
  }
);

for (const { theme, config } of EMPTY_CONFIGS) {
  test(
    `the first subscription can be reviewed and staged at 375px in ${theme} theme`,
    { tag: E2E_TAG.Mock },
    async ({ page, simpleRoutesPage: routes, applyBar }) => {
      await page.setViewportSize(PHONE);
      await page.addInitScript(saveTheme, theme);
      await page.route(
        (url) => url.hostname === SUBSCRIPTION_HOST,
        async (route) => route.abort()
      );
      await routes.openWithConfig(config);

      await test.step('the header keeps the mode tabs and actions available at phone width', async () => {
        await expect(routes.views).toBeVisible();
        await expect(routes.addFromHeader).toBeVisible();
        await expect(routes.openHistory).toBeVisible();
        await expect(routes.configPath).toBeHidden();
        const history = await routes.openHistory.boundingBox();
        const add = await routes.addFromHeader.boundingBox();
        expect(history).not.toBeNull();
        expect(add).not.toBeNull();
        expect(add?.width).toBe(history?.width);
        expect(add?.x).toBe(history?.x);
        expect(add?.y).toBeGreaterThan((history?.y ?? 0) + (history?.height ?? 0));
        expect((PHONE.width - (add?.width ?? 0)) * HALF).toBe(add?.x);
        expect(
          await routes.header.evaluate(
            (element: { scrollWidth: number; clientWidth: number }) => element.scrollWidth - element.clientWidth
          )
        ).toBeLessThanOrEqual(0);
      });

      await test.step('the form fits the viewport, and Escape restores focus without staging', async () => {
        await routes.addFromStarter.press('Enter');
        await expect(routes.serverLink).toBeFocused();
        await routes.serverLink.fill(SUBSCRIPTION_URL);
        await expect(routes.subscriptionNotice).toBeVisible();
        await expect
          .poll(async () => {
            const [input, cancel, submit] = await Promise.all([
              routes.serverLink.boundingBox(),
              routes.cancel.boundingBox(),
              routes.stageSubscription.boundingBox(),
            ]);

            return (
              input !== null &&
              cancel !== null &&
              submit !== null &&
              Math.abs(cancel.width - input.width) <= 1 &&
              Math.abs(submit.width - input.width) <= 1 &&
              Math.abs(submit.x - cancel.x) <= 1 &&
              submit.y > cancel.y + cancel.height
            );
          })
          .toBe(true);
        await routes.setSubscriptionInterval(MOBILE_INTERVAL_HOURS, 'hours');
        await routes.selectSubscriptionAgent('chrome');
        await expect(routes.subscriptionAgentValue).toHaveValue(/Chrome\//);
        await routes.subscriptionAgentValue.fill(USER_AGENT);
        await expect(routes.subscriptionAgentValue).toHaveValue(USER_AGENT);
        await expect(page.locator('html')).toHaveCSS('color-scheme', theme);
        expect(await page.evaluate<number>('document.documentElement.scrollWidth')).toBeLessThanOrEqual(PHONE.width);
        expect(
          await routes.dialog.evaluate(
            (element: { scrollWidth: number; clientWidth: number }) => element.scrollWidth - element.clientWidth
          )
        ).toBeLessThanOrEqual(0);

        await routes.subscriptionAgentHelpButton.scrollIntoViewIfNeeded();
        const fieldsBeforeHelp = await routes.subscriptionAgent.boundingBox();
        await routes.subscriptionAgentHelpButton.press('Enter');
        await expect(routes.subscriptionAgentHelp).toBeVisible();
        expect(await routes.subscriptionAgent.boundingBox()).toEqual(fieldsBeforeHelp);

        await page.keyboard.press('Escape');
        await expect(routes.subscriptionAgentHelp).toBeHidden();
        await expect(routes.dialog).toBeVisible();
        await expect(routes.subscriptionAgentHelpButton).toBeFocused();

        await page.keyboard.press('Escape');
        await expect(routes.dialog).toBeHidden();
        await expect(routes.addFromStarter).toBeFocused();
        await expect(applyBar.dirty).toBeHidden();
      });

      await test.step('the same starter adds the first subscription and hands focus to the surviving trigger', async () => {
        await routes.addFromStarter.press('Enter');
        await routes.serverLink.fill(SUBSCRIPTION_URL);
        await routes.subscriptionTag.fill(STAGED_TAG);
        await routes.stageSubscription.press('Enter');

        await expect(page).toHaveURL('/config/simple');
        await expect(routes.dialog).toBeHidden();
        await expect(routes.starter).toBeHidden();
        await expect(routes.addFromOutbounds).toBeFocused();
        await expect(routes.outbounds).toContainText(translate(SIMPLE_ROUTES, 'outbounds.providers', { count: 1 }));
        await expect(applyBar.dirty).toBeVisible();
      });
    }
  );
}

const SERVER_GROUP = 'manual-proxies';
const APPLIED_SERVER = {
  type: 'vless',
  tag: 'existing-server',
  server: 'server.example.invalid',
  server_port: 443,
  uuid: UUID,
};
const SERVER_WITH_GROUP = {
  outbounds: [
    APPLIED_SERVER,
    { type: 'selector', tag: SERVER_GROUP, outbounds: [APPLIED_SERVER.tag] },
    { type: 'direct', tag: DIRECT },
  ],
};

test(
  'Simple rejects applied and staged server duplicates and previews a different server and its group',
  { tag: E2E_TAG.Mock },
  async ({ page, simpleRoutesPage: routes, applyBar }) => {
    await page.setViewportSize(DESKTOP);
    await routes.openWithConfig(SERVER_WITH_GROUP);
    await routes.addFromHeader.press('Enter');
    await expect(routes.serverLink).toBeFocused();

    const duplicate = routes.dialog.getByText(translate(NODE_ADD, 'server.duplicate'), { exact: true });
    const omitted = translate(NODE_ADD, 'field.link.omittedParams', { names: 'spx' });
    await routes.serverLink.fill(LINK.replace('#', '?spx=private-omitted-value#'));
    await expect(duplicate).toBeVisible();
    await expect(routes.dialog.getByText(omitted, { exact: true })).toBeHidden();
    await expect(routes.addServer).toBeDisabled();
    await expect(applyBar.dirty).toBeHidden();
    await expect(routes.dialog).not.toContainText(UUID);

    await routes.serverLink.fill('vless://fake-credential@server.example.invalid');
    await routes.addServer.click();
    await expect(routes.dialog.getByRole('alert')).toContainText(translate(NODE_ADD, 'error.link.server'));
    await expect(routes.serverLink).toBeFocused();
    await routes.serverLink.fill('example://unused');
    await routes.addServer.click();
    await expect(routes.dialog.getByRole('alert')).toContainText(translate(NODE_ADD, 'error.link.scheme'));

    const different = LINK.replace(':443#', ':8443?spx=private-omitted-value#');
    await routes.serverLink.fill(different);
    await expect(routes.dialog).toContainText('server.example.invalid:8443');
    await expect(routes.dialog).toContainText(omitted);
    await expect(routes.subscriptionGroup).toHaveAccessibleDescription(translate(NODE_ADD, 'server.groupHint'));
    await expect(routes.dialog).not.toContainText(/private-omitted-value|fake-credential|01234567-89ab/);
    await expect(duplicate).toBeHidden();

    await routes.subscriptionGroup.press('Enter');
    const group = page.getByRole('option', { name: SERVER_GROUP, exact: true });
    await expect(page.getByRole('option', { name: DIRECT, exact: true })).toBeHidden();
    await group.click();
    await routes.addServer.click();
    await expect(routes.dialog).toBeHidden();
    await expect(routes.addFromHeader).toBeFocused();

    await routes.addFromOutbounds.click();
    await routes.serverLink.fill(different.replace(SERVER, 'renamed-server'));
    await expect(duplicate).toBeVisible();
    await expect(routes.addServer).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(routes.addFromOutbounds).toBeFocused();

    await applyBar.apply();
    await expect(applyBar.nodeChanges).toContainText(SERVER);
    await expect(applyBar.nodeChanges).toContainText(SERVER_GROUP);
    await applyBar.showChangesText();
    await expect(applyBar.diff).toContainText('8443');
    await expect(applyBar.diff).toContainText('••••••');
    await expect(applyBar.diff).not.toContainText(UUID);
    await expect(applyBar.diff).not.toContainText('private-omitted-value');
  }
);

test(
  'at 375px Simple can cancel server settings and add the first server with a new group',
  { tag: E2E_TAG.Mock },
  async ({ page, simpleRoutesPage: routes, applyBar }) => {
    await page.setViewportSize(PHONE);
    await page.addInitScript(saveTheme, 'dark');
    await routes.openWithConfig({});

    await routes.addFromStarter.click();
    await expect(routes.serverLink).toBeFocused();
    await routes.serverLink.fill(LINK);
    const name = routes.dialog.getByRole('textbox', { name: translate(NODE_ADD, 'server.tag'), exact: true });
    await expect(name).toHaveValue(SERVER);
    await routes.subscriptionGroup.click();
    await page.getByRole('option', { name: translate(NODE_ADD, 'subscription.newGroup'), exact: true }).click();
    const groupName = routes.dialog.getByRole('textbox', {
      name: translate(NODE_ADD, 'subscription.groupName'),
      exact: true,
    });
    await groupName.fill(SERVER_GROUP);
    await expect(groupName).toBeInViewport();
    await expect(routes.addServer).toBeInViewport();
    expect(
      await routes.dialog.evaluate(
        (element: { scrollWidth: number; clientWidth: number }) => element.scrollWidth - element.clientWidth
      )
    ).toBeLessThanOrEqual(0);

    await routes.cancel.click();
    await expect(routes.addFromStarter).toBeFocused();
    await expect(applyBar.dirty).toBeHidden();

    await routes.addFromStarter.press('Enter');
    await expect(routes.serverLink).toBeFocused();
    await expect(routes.serverLink).toHaveValue('');
    await routes.serverLink.fill(LINK);
    await expect(groupName).toBeHidden();
    await routes.subscriptionGroup.click();
    await page.getByRole('option', { name: translate(NODE_ADD, 'subscription.newGroup'), exact: true }).click();
    await groupName.fill(SERVER_GROUP);
    await routes.addServer.click();
    await expect(routes.addFromOutbounds).toBeFocused();
    await expect(routes.outbounds).toContainText(SERVER);
    await expect(routes.outbounds).toContainText(SERVER_GROUP);
    await expect(applyBar.dirty).toBeVisible();
  }
);

test(
  'at 529px Simple keeps ambiguous links out of the draft and requires a separate-server decision by keyboard',
  { tag: E2E_TAG.Mock },
  async ({ page, simpleRoutesPage: routes, applyBar }) => {
    await page.setViewportSize(NARROW);
    await page.addInitScript(saveTheme, 'light');
    await routes.openWithConfig({
      outbounds: [
        { ...APPLIED_SERVER, detour: DIRECT },
        { type: 'direct', tag: DIRECT },
      ],
    });
    await routes.addFromHeader.press('Enter');
    await expect(routes.serverLink).toBeFocused();

    await test.step('multiple links stay in the form without previewing a server', async () => {
      await routes.serverLink.fill(`${LINK} https://user:private@subscription.example.invalid/token`);
      await routes.serverLink.press('Enter');
      await expect(routes.dialog.getByRole('alert')).toHaveText(translate(NODE_ADD, 'server.multipleLinks'));
      await expect(routes.serverLink).toBeFocused();
      await expect(routes.dialog).not.toContainText(/private|01234567-89ab/);
      await expect(applyBar.dirty).toBeHidden();
    });

    await test.step('a possible duplicate requires an explicit choice', async () => {
      await routes.serverLink.fill(LINK);
      const separate = routes.dialog.getByRole('checkbox', { name: translate(NODE_ADD, 'server.addSeparate') });
      await expect(separate).toHaveAccessibleDescription(translate(NODE_ADD, 'server.possibleDuplicate'));
      await expect
        .poll(async () => {
          const cancelBounds = await routes.cancel.boundingBox();
          const addBounds = await routes.addServer.boundingBox();
          if (cancelBounds === null || addBounds === null) return false;

          return Math.abs(cancelBounds.width - addBounds.width) <= 1 && cancelBounds.y < addBounds.y;
        })
        .toBe(true);
      await routes.serverLink.press('Enter');
      await expect(separate).toBeFocused();
      await expect(applyBar.dirty).toBeHidden();
      await page.keyboard.press('Space');
      await expect(separate).toBeChecked();
      await routes.addServer.press('Enter');
      await expect(routes.dialog).toBeHidden();
      await expect(routes.addFromHeader).toBeFocused();
      await expect(applyBar.dirty).toBeVisible();
      await expect(routes.outbounds).toContainText(APPLIED_SERVER.tag);
      await expect(routes.outbounds).toContainText(SERVER);
    });
  }
);
