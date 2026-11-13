import { E2E_TAG, expect, test } from './fixtures/index.ts';

const RULE = { title: '192.168.1.100/32 → direct', index: 4 };
const NAME = 'Printer';

test(
  'applies a renamed rule through the diff and the confirmation window',
  { tag: E2E_TAG.Mock },
  async ({ configPage, applyBar }) => {
    await configPage.goto();

    await test.step('renaming a rule leaves an unapplied draft', async () => {
      await configPage.openRule(RULE.title, RULE.index);
      await configPage.ruleName.fill(NAME);

      await expect(applyBar.dirty).toBeVisible();
    });

    await test.step('the diff shows the name as a comment line', async () => {
      await applyBar.apply();

      await expect(applyBar.diff).toContainText(`// ${NAME}`);
    });

    await test.step('applying opens the confirmation window', async () => {
      await applyBar.confirmDiff();

      await expect(applyBar.keepButton).toBeVisible();
    });

    await test.step('confirming the link keeps the config', async () => {
      await applyBar.keep();

      await expect(applyBar.confirmed).toBeVisible();
    });
  }
);
