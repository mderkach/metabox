import { HOW_IT_WORKS_NS } from '../src/pages/HowItWorks/i18n/HowItWorks.namespace.generated.ts';
import { SHARED_NS } from '../src/shared/i18n/Shared.namespace.generated.ts';
import { APP_SIDEBAR_NS } from '../src/widgets/AppSidebar/i18n/AppSidebar.namespace.generated.ts';
import { E2E_TAG, expect, test, translate } from './fixtures/index.ts';

const desktop = { width: 1280, height: 812 };
const phones = [
  { width: 320, height: 812 },
  { width: 375, height: 812 },
];
const BOTTOM_SECTIONS = 5;

for (const viewport of [desktop, ...phones]) {
  test(`walks a connection from the menu at ${viewport.width}px`, { tag: E2E_TAG.Mock }, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page).toHaveURL(/\/overview$/);
    await expect(page.getByRole('heading', { level: 1, name: translate(SHARED_NS, 'section.overview') })).toBeVisible();
    if (viewport === desktop) {
      const nav = page.getByRole('navigation', { name: translate(APP_SIDEBAR_NS, 'nav.label') });
      const help = page.getByRole('link', { name: translate(APP_SIDEBAR_NS, 'nav.help'), exact: true });
      await expect(nav.getByRole('link', { name: translate(APP_SIDEBAR_NS, 'nav.help') })).toHaveCount(0);
      await nav.getByRole('link', { name: translate(SHARED_NS, 'section.settings') }).focus();
      await page.keyboard.press('Tab');
      await expect(help).toBeFocused();
      await expect(help).not.toHaveCSS('box-shadow', 'none');
      await page.keyboard.press('Enter');
      await expect(help).toHaveAttribute('aria-current', 'page');
    } else {
      const bottom = page.getByRole('navigation', { name: translate(APP_SIDEBAR_NS, 'nav.label') });
      await expect(bottom.getByRole('link')).toHaveCount(BOTTOM_SECTIONS);
      await bottom.getByRole('button', { name: translate(APP_SIDEBAR_NS, 'more.label') }).click();
      const more = page.getByRole('navigation', { name: translate(APP_SIDEBAR_NS, 'more.sections') });
      await expect(more.getByRole('link')).toHaveText([
        translate(HOW_IT_WORKS_NS, 'title'),
        translate(SHARED_NS, 'section.logs'),
        translate(SHARED_NS, 'section.diagnostics'),
        translate(SHARED_NS, 'section.settings'),
      ]);
      await more.getByRole('link', { name: translate(HOW_IT_WORKS_NS, 'title'), exact: true }).click();
    }
    await expect(page).toHaveURL(/\/how-it-works$/);
    await expect(page.getByRole('heading', { level: 1, name: translate(HOW_IT_WORKS_NS, 'title') })).toBeVisible();

    const choices = page.getByRole('group', { name: translate(HOW_IT_WORKS_NS, 'connections') });
    const walk = page.getByRole('list', { name: translate(HOW_IT_WORKS_NS, 'walk') });
    await expect(
      choices.getByRole('button', {
        name: `${translate(HOW_IT_WORKS_NS, 'choice.group')} example.com:443`,
        pressed: true,
      })
    ).toBeVisible();
    await expect(walk.getByText('laptop', { exact: true })).toBeVisible();
    await expect(walk.getByText('Media sites', { exact: true })).toBeVisible();
    await expect(
      walk.getByText(translate(HOW_IT_WORKS_NS, 'group.picked', { tag: 'auto' }), { exact: true })
    ).toBeVisible();
    await expect(
      walk.getByText(translate(HOW_IT_WORKS_NS, 'group.picked', { tag: 'server-a' }), { exact: true })
    ).toBeVisible();
    await expect(
      walk.getByText(translate(HOW_IT_WORKS_NS, 'provider', { name: 'provider-one' }), { exact: true })
    ).toBeVisible();

    const standalone = choices.getByRole('button', {
      name: `${translate(HOW_IT_WORKS_NS, 'choice.server')} docs.example.com:443`,
    });
    await standalone.click();
    await expect(standalone).toHaveAttribute('aria-pressed', 'true');
    const ruleLabel = translate(SHARED_NS, 'rule.caption', { subject: 'docs.example.com', target: 'server-b' });
    await expect(walk.getByText(ruleLabel, { exact: true })).toBeVisible();
    await expect(
      walk.getByRole('button', { name: `${translate(HOW_IT_WORKS_NS, 'steps.server')} server-b`, exact: true })
    ).toBeVisible();

    await choices
      .getByRole('button', { name: `${translate(HOW_IT_WORKS_NS, 'choice.direct')} home.example.com:443` })
      .click();
    await expect(page.getByText(translate(HOW_IT_WORKS_NS, 'noServer'), { exact: true })).toBeVisible();

    const server = walk.getByRole('button', {
      name: `${translate(HOW_IT_WORKS_NS, 'steps.server')} ${translate(HOW_IT_WORKS_NS, 'noServer')} ${translate(HOW_IT_WORKS_NS, 'internet')}`,
      exact: true,
    });
    await server.click();
    await expect(server).toBeFocused();
    expect(await page.evaluate<number>('document.documentElement.scrollWidth')).toBeLessThanOrEqual(viewport.width);

    await page.getByRole('link', { name: translate(HOW_IT_WORKS_NS, 'terms.configure') }).click();
    await expect(page).toHaveURL(/\/config\/outbounds$/);
  });
}

test('opens the verified applied rule from the walk', { tag: E2E_TAG.Mock }, async ({ page }) => {
  await page.setViewportSize(desktop);
  await page.goto('/how-it-works');
  const choices = page.getByRole('group', { name: translate(HOW_IT_WORKS_NS, 'connections') });
  await choices.getByRole('button', { pressed: true }).waitFor();

  const walk = page.getByRole('list', { name: translate(HOW_IT_WORKS_NS, 'walk') });
  const rule = walk.getByRole('button', { name: /^Rule Media sites/ });
  await expect(rule).toBeVisible();
  await rule.click();
  await page.getByRole('link', { name: translate(HOW_IT_WORKS_NS, 'terms.configure') }).click();

  await expect(page).toHaveURL(/\/config\?.*\bruleEtag=/);
  await expect(page.getByRole('complementary', { name: 'Media sites', exact: true })).toBeVisible();
});

test('keeps Help accessible and current in the collapsed sidebar', { tag: E2E_TAG.Mock }, async ({ page }) => {
  await page.setViewportSize(desktop);
  await page.goto('/overview');
  await page.getByRole('button', { name: translate(APP_SIDEBAR_NS, 'nav.collapse') }).click();
  const nav = page.getByRole('navigation', { name: translate(APP_SIDEBAR_NS, 'nav.label') });
  await nav.getByRole('link', { name: translate(SHARED_NS, 'section.settings') }).focus();
  await page.keyboard.press('Tab');

  const help = page.getByRole('link', { name: translate(APP_SIDEBAR_NS, 'nav.help'), exact: true });
  await expect(help).toBeFocused();
  await expect(help).not.toHaveCSS('box-shadow', 'none');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/how-it-works$/);
  await expect(help).toHaveAttribute('aria-current', 'page');
});
