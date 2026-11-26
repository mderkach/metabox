import { APP_NS } from '../src/app/i18n/App.namespace.generated.ts';
import { RULE_SETS_NS } from '../src/pages/RuleSets/i18n/RuleSets.namespace.generated.ts';
import { E2E_TAG, expect, test, translate } from './fixtures/index.ts';

// The first two DNS servers of the mock config.
const FIRST = 'dns-hosts';
const SECOND = 'dns-direct-cf';

test('moves through the list and the node panel from the keyboard', { tag: E2E_TAG.Mock }, async ({ sectionPage }) => {
  const { page } = sectionPage;

  const firstRow = page.getByRole('button', { name: FIRST, exact: true });

  await sectionPage.goto('dns');
  await expect(firstRow).toBeVisible();

  await test.step('? opens the list of shortcuts, Escape closes it', async () => {
    await page.keyboard.press('?');

    const help = page.getByRole('dialog', { name: translate(APP_NS, 'shortcuts.title') });

    await expect(help).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(help).toBeHidden();
  });

  await test.step('the arrow keys move between rows and Enter opens the row in focus', async () => {
    await firstRow.focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    await expect(sectionPage.panel(SECOND)).toBeVisible();
  });

  await test.step('the arrow keys on the panel title open the neighbouring node', async () => {
    await page.keyboard.press('ArrowUp');

    await expect(sectionPage.panel(FIRST)).toBeVisible();
  });
});

test(
  'Shift+N opens the own list form and N the catalog on the Rule sets screen',
  { tag: E2E_TAG.Mock },
  async ({ page }) => {
    const custom = page.getByRole('button', { name: translate(RULE_SETS_NS, 'custom.open'), exact: true });
    const catalog = page.getByRole('button', { name: translate(RULE_SETS_NS, 'add.open'), exact: true });

    await page.goto('/config/rule-set');
    await expect(custom).toBeVisible();

    await test.step('Shift+N opens the own list form', async () => {
      await page.keyboard.press('Shift+N');

      await expect(page.getByRole('complementary', { name: translate(RULE_SETS_NS, 'custom.title') })).toBeVisible();
      await expect(custom).toHaveAttribute('aria-expanded', 'true');
    });

    await test.step('after Escape, N opens the catalog', async () => {
      await page.keyboard.press('Escape');
      await page.keyboard.press('N');

      await expect(catalog).toHaveAttribute('aria-expanded', 'true');
    });
  }
);
