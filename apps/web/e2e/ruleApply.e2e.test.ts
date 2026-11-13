import { E2E_TAG, expect, test, translate } from './fixtures/index.ts';

const RULE = { title: '192.168.1.100/32 → direct', index: 4 };
// The DNS hijack rule leads the CI bench config; the checks before e2e only append rules after it.
const BENCH_RULE = {
  title: translate('shared', 'rule.caption', {
    subject: 'dns-in',
    target: translate('shared', 'ruleAction.hijack-dns'),
  }),
  index: 1,
};
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

    await test.step('the summary names the rename', async () => {
      await applyBar.apply();

      await expect(applyBar.ruleChanges.getByRole('link', { name: NAME })).toBeVisible();
    });

    await test.step('the text of the changes shows the name as a comment line', async () => {
      await applyBar.showChangesText(1);

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

test('a confirmed rename stays after a reload', { tag: E2E_TAG.Live }, async ({ configPage, applyBar }) => {
  await configPage.goto();

  await test.step('renaming the rule and applying it opens the confirmation window', async () => {
    await configPage.openRule(BENCH_RULE.title, BENCH_RULE.index);
    await configPage.ruleName.fill(NAME);
    await applyBar.apply();
    await applyBar.confirmDiff();

    await expect(applyBar.keepButton).toBeVisible();
  });

  await test.step('confirming the link keeps the config', async () => {
    await applyBar.keep();

    await expect(applyBar.confirmed).toBeVisible();
  });

  await test.step('the daemon serves the renamed rule after a reload', async () => {
    await configPage.page.reload();

    await expect(configPage.ruleRow(NAME, BENCH_RULE.index)).toBeVisible();
    await expect(applyBar.dirty).toBeHidden();
  });
});
