import { E2E_TAG, expect, test } from './fixtures/index.ts';

const RULE = { title: '192.168.1.100/32 → direct', index: 4 };
const RULE_NAME = 'Printer';
const DNS_SERVER = 'dns-direct-cf';

test(
  'a rename alone is one summary item that leads back to the rule',
  { tag: E2E_TAG.Mock },
  async ({ configPage, applyBar }) => {
    await configPage.goto();

    await test.step('renaming a rule marks its row changed', async () => {
      await configPage.openRule(RULE.title, RULE.index);
      await configPage.ruleName.fill(RULE_NAME);

      await expect(configPage.editedRuleRow(RULE_NAME, RULE.index)).toBeVisible();
    });

    await test.step('the summary names the rename as its only rule change', async () => {
      await applyBar.apply();

      await expect(applyBar.ruleChanges.getByRole('listitem')).toHaveCount(1);
      await expect(applyBar.ruleChanges).toContainText(RULE.title);
    });

    await test.step('the item opens the rule in the side panel', async () => {
      await applyBar.ruleChanges.getByRole('link', { name: RULE_NAME }).click();

      await expect(applyBar.diff).toBeHidden();
      await expect(configPage.page).toHaveURL(`/config?rule=${String(RULE.index)}`);
      await expect(configPage.page.getByRole('complementary', { name: RULE_NAME })).toBeVisible();
    });
  }
);

test(
  'a summary item opens the changed section node in the side panel',
  { tag: E2E_TAG.Mock },
  async ({ sectionPage, applyBar }) => {
    await sectionPage.goto('dns');

    await test.step('editing a DNS server leaves an unapplied draft', async () => {
      await sectionPage.openNode(DNS_SERVER);
      await sectionPage.serverField(DNS_SERVER).fill('1.0.0.1');
      await sectionPage.closePanel.click();

      await expect(applyBar.dirty).toBeVisible();
      await expect(sectionPage.panel(DNS_SERVER)).toBeHidden();
    });

    await test.step('the summary item leads to the node, and the node opens', async () => {
      await applyBar.apply();
      await applyBar.nodeChanges.getByRole('link', { name: DNS_SERVER }).click();

      await expect(applyBar.diff).toBeHidden();
      await expect(sectionPage.serverField(DNS_SERVER)).toHaveValue('1.0.0.1');
    });
  }
);
