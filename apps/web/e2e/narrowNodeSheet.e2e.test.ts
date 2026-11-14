import { E2E_TAG, expect, test, translate } from './fixtures/index.ts';

const NODE_FORM = 'features/Config/ConfigNodeForm';
const NODE = 'node-a-vless-reality';
// The longest enum list of the mock VLESS node: its last value is wider than a phone sheet allows in one row.
const ENUM_LIST = /curve_preferences/;
const PHONE_WIDTH = { Small: 375, Common: 400 } as const;
const PHONE_HEIGHT = 812;

for (const width of Object.values(PHONE_WIDTH)) {
  for (const theme of ['dark', 'light'] as const) {
    test(
      `the node panel opens as a sheet that holds the form at ${String(width)} px, ${theme} theme`,
      { tag: E2E_TAG.Mock },
      async ({ page, sectionPage }) => {
        await page.setViewportSize({ width, height: PHONE_HEIGHT });
        await page.addInitScript((value) => {
          localStorage.setItem('theme', value);
        }, theme);
        await sectionPage.goto('outbounds');

        await test.step('the node opens in a bottom sheet without widening the page', async () => {
          await sectionPage.openNode(NODE);

          await expect(page.getByRole('dialog', { name: NODE })).toBeVisible();
          await expect(page.locator('html')).toHaveCSS('color-scheme', theme);
          expect(await page.evaluate<number>('document.documentElement.scrollWidth')).toBeLessThanOrEqual(width);
        });

        await test.step('an enum list wraps inside the sheet', async () => {
          const sheet = await page.getByRole('dialog', { name: NODE }).boundingBox();
          const values = page.getByRole('group', { name: ENUM_LIST }).getByRole('button');
          const last = await values.last().boundingBox();

          expect(sheet).not.toBeNull();
          expect(last).not.toBeNull();
          expect((last?.x ?? 0) + (last?.width ?? 0)).toBeLessThanOrEqual((sheet?.x ?? 0) + (sheet?.width ?? 0));
        });

        await test.step('a required field cleared in the sheet is reported, and a new value is written', async () => {
          const server = sectionPage.serverField(NODE);
          const required = sectionPage.panel(NODE).getByText(translate(NODE_FORM, 'error.required'));

          await server.fill('');
          await server.blur();
          await expect(required).toBeVisible();

          await server.fill('node-b.example.invalid');
          await server.blur();
          await expect(required).toBeHidden();
        });
      }
    );
  }
}
