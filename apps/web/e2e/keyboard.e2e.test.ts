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

    const help = page.getByRole('dialog', { name: translate('app', 'shortcuts.title') });

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
