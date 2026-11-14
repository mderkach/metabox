import { E2E_TAG, expect, test } from './fixtures/index.ts';

// `proxy` is a URL test of the mock config: the panel cannot switch its node and offers a selector over it.
const GROUP = 'proxy';

test(
  'adds a manual choice over an automatic group and applies it through the diff',
  { tag: E2E_TAG.Mock },
  async ({ proxiesPage, applyBar }) => {
    await proxiesPage.goto();

    await test.step('the keyboard action leaves a draft and moves focus to its result', async () => {
      await proxiesPage.addManualChoiceButton(GROUP).focus();
      await proxiesPage.page.keyboard.press('Enter');

      await expect(proxiesPage.manualChoiceAdded).toBeFocused();
      await expect(proxiesPage.addManualChoiceButton(GROUP)).toBeHidden();
      await expect(applyBar.dirty).toBeVisible();
    });

    await test.step('the diff names the renamed group and the selector that took its tag', async () => {
      await applyBar.apply();

      await expect(applyBar.diff.getByRole('link', { name: `${GROUP}-auto`, exact: true })).toBeVisible();
      await expect(applyBar.diff.getByRole('link', { name: GROUP, exact: true })).toBeVisible();
    });

    await test.step('applying and confirming keeps the config', async () => {
      await applyBar.confirmDiff();
      await applyBar.keep();

      await expect(applyBar.confirmed).toBeVisible();
    });
  }
);
