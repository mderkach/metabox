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
