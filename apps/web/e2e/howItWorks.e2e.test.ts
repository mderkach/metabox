import { E2E_TAG, expect, test, translate } from './fixtures/index.ts';

const ns = 'pages/HowItWorks';
const desktop = { width: 1280, height: 812 };
const phone = { width: 375, height: 812 };

for (const viewport of [desktop, phone]) {
  test(`walks a connection from the menu at ${viewport.width}px`, { tag: E2E_TAG.Mock }, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/overview');

    if (viewport === phone) {
      await page.getByRole('button', { name: translate('widgets/AppSidebar', 'more.label') }).click();
    }
    await page.getByRole('link', { name: translate(ns, 'title'), exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: translate(ns, 'title') })).toBeVisible();

    const choices = page.getByRole('group', { name: translate(ns, 'connections') });
    await expect(choices.getByRole('button', { name: /Through a group/, pressed: true })).toBeVisible();
    await expect(page.getByText(/Picked us/).first()).toBeVisible();
    await choices.getByRole('button', { name: /Direct/ }).click();
    await expect(page.getByText(translate(ns, 'noServer'), { exact: true })).toBeVisible();

    const server = page.getByRole('button', { name: /Server No proxy server/ });
    await server.click();
    await expect(server).toBeFocused();
    expect(await page.evaluate<number>('document.documentElement.scrollWidth')).toBeLessThanOrEqual(viewport.width);

    await page.getByRole('link', { name: translate(ns, 'terms.configure') }).click();
    await expect(page).toHaveURL(/\/config\/outbounds$/);
  });
}
