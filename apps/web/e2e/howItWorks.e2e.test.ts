import { E2E_TAG, expect, test, translate } from './fixtures/index.ts';

const ns = 'pages/HowItWorks';
const desktop = { width: 1280, height: 812 };
const phones = [
  { width: 320, height: 812 },
  { width: 375, height: 812 },
];
const sidebar = 'widgets/AppSidebar';
const BOTTOM_SECTIONS = 5;

for (const viewport of [desktop, ...phones]) {
  test(`walks a connection from the menu at ${viewport.width}px`, { tag: E2E_TAG.Mock }, async ({ page }) => {
    await page.setViewportSize(viewport);
    if (viewport === desktop) {
      await page.goto('/overview');
      const nav = page.getByRole('navigation', { name: translate(sidebar, 'nav.label') });
      const help = page.getByRole('link', { name: translate(sidebar, 'nav.help'), exact: true });
      await expect(nav.getByRole('link', { name: translate(sidebar, 'nav.help') })).toHaveCount(0);
      await nav.getByRole('link', { name: translate('shared', 'section.settings') }).focus();
      await page.keyboard.press('Tab');
      await expect(help).toBeFocused();
      await expect(help).not.toHaveCSS('box-shadow', 'none');
      await page.keyboard.press('Enter');
      await expect(help).toHaveAttribute('aria-current', 'page');
    } else {
      await page.goto('/');
      await expect(page).toHaveURL(/\/overview$/);
      const bottom = page.getByRole('navigation', { name: translate(sidebar, 'nav.label') });
      await expect(bottom.getByRole('link')).toHaveCount(BOTTOM_SECTIONS);
      await bottom.getByRole('button', { name: translate(sidebar, 'more.label') }).click();
      const more = page.getByRole('navigation', { name: translate(sidebar, 'more.sections') });
      await expect(more.getByRole('link')).toHaveText([
        translate(ns, 'title'),
        translate('shared', 'section.logs'),
        translate('shared', 'section.diagnostics'),
        translate('shared', 'section.settings'),
      ]);
      await more.getByRole('link', { name: translate(ns, 'title'), exact: true }).click();
    }
    await expect(page).toHaveURL(/\/how-it-works$/);
    await expect(page.getByRole('heading', { level: 1, name: translate(ns, 'title') })).toBeVisible();

    const choices = page.getByRole('group', { name: translate(ns, 'connections') });
    const walk = page.getByRole('list', { name: translate(ns, 'walk') });
    await expect(
      choices.getByRole('button', { name: `${translate(ns, 'choice.group')} example.com:443`, pressed: true })
    ).toBeVisible();
    await expect(walk.getByText('laptop', { exact: true })).toBeVisible();
    await expect(walk.getByText('Media sites', { exact: true })).toBeVisible();
    await expect(walk.getByText(translate(ns, 'group.picked', { tag: 'auto' }), { exact: true })).toBeVisible();
    await expect(walk.getByText(translate(ns, 'group.picked', { tag: 'server-a' }), { exact: true })).toBeVisible();
    await expect(walk.getByText(translate(ns, 'provider', { name: 'provider-one' }), { exact: true })).toBeVisible();

    const standalone = choices.getByRole('button', {
      name: `${translate(ns, 'choice.server')} docs.example.com:443`,
    });
    await standalone.click();
    await expect(standalone).toHaveAttribute('aria-pressed', 'true');
    const ruleLabel = translate('shared', 'rule.caption', { subject: 'docs.example.com', target: 'server-b' });
    await expect(walk.getByText(ruleLabel, { exact: true })).toBeVisible();
    await expect(
      walk.getByRole('button', { name: `${translate(ns, 'steps.server')} server-b`, exact: true })
    ).toBeVisible();

    await choices.getByRole('button', { name: `${translate(ns, 'choice.direct')} home.example.com:443` }).click();
    await expect(page.getByText(translate(ns, 'noServer'), { exact: true })).toBeVisible();

    const server = walk.getByRole('button', {
      name: `${translate(ns, 'steps.server')} ${translate(ns, 'noServer')} ${translate(ns, 'internet')}`,
      exact: true,
    });
    await server.click();
    await expect(server).toBeFocused();
    expect(await page.evaluate<number>('document.documentElement.scrollWidth')).toBeLessThanOrEqual(viewport.width);

    await page.getByRole('link', { name: translate(ns, 'terms.configure') }).click();
    await expect(page).toHaveURL(/\/config\/outbounds$/);
  });
}

test('opens the verified applied rule from the walk', { tag: E2E_TAG.Mock }, async ({ page }) => {
  await page.setViewportSize(desktop);
  await page.goto('/how-it-works');

  const walk = page.getByRole('list', { name: translate(ns, 'walk') });
  const rule = walk.getByRole('button', { name: /^Rule Media sites/ });
  await expect(rule).toBeVisible();
  await rule.click();
  await page.getByRole('link', { name: translate(ns, 'terms.configure') }).click();

  await expect(page).toHaveURL(/\/config\?.*\bruleEtag=/);
  await expect(page.getByRole('complementary', { name: 'Media sites', exact: true })).toBeVisible();
});

test('keeps Help accessible and current in the collapsed sidebar', { tag: E2E_TAG.Mock }, async ({ page }) => {
  await page.setViewportSize(desktop);
  await page.goto('/overview');
  await page.getByRole('button', { name: translate(sidebar, 'nav.collapse') }).click();
  const nav = page.getByRole('navigation', { name: translate(sidebar, 'nav.label') });
  await nav.getByRole('link', { name: translate('shared', 'section.settings') }).focus();
  await page.keyboard.press('Tab');

  const help = page.getByRole('link', { name: translate(sidebar, 'nav.help'), exact: true });
  await expect(help).toBeFocused();
  await expect(help).not.toHaveCSS('box-shadow', 'none');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/how-it-works$/);
  await expect(help).toHaveAttribute('aria-current', 'page');
});
