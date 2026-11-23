import { E2E_TAG, expect, test, translate } from './fixtures/index.ts';
import { SIMPLE_SECTION_HEADINGS } from './pages/SimpleRoutesPage.ts';

const SERVER = 'simple-routes-server';
const UUID = '01234567-89ab-4cde-8123-456789abcdef';
const LINK = `vless://${UUID}@server.example.invalid:443#${SERVER}`;
const DIRECT = 'direct';
const DIRECT_RULE = 'home.example.com';
const OTHER_RULE = 'docs.example.com';
const SIMPLE_ROUTES = 'pages/SimpleRoutes';
const STAND_COUNTS = { inbounds: 3, dnsResolvers: 11, dnsRules: 12 };
const DESKTOP = { width: 1280, height: 600 };
const PHONE = { width: 375, height: 812 };
const MOCK_VERSION_COUNT = 2;

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

      await routes.editorOutbounds.click();
      await expect(page).toHaveURL('/config/outbounds');
      await expect(page.getByRole('button', { name: SERVER, exact: true })).toBeVisible();

      await routes.editorView.press('ArrowRight');
      await expect(routes.jsonView).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL('/config/raw');
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

for (const theme of ['light', 'dark'] as const) {
  test(
    `the empty Simple view opens the same focused server dialog from both actions in ${theme} theme`,
    { tag: E2E_TAG.Mock },
    async ({ page, simpleRoutesPage: routes, applyBar }) => {
      await page.setViewportSize(PHONE);
      await page.addInitScript(saveTheme, theme);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await routes.openEmpty();

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
          await expect(routes.subscription).toHaveAttribute('href', '/config/providers');
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

      await test.step('the subscription link in the same dialog reaches the existing editor section', async () => {
        await routes.addFromStarter.click();
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
