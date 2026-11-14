import { E2E_TAG, expect, test, translate } from './fixtures/index.ts';

const RULE = { title: '192.168.1.100/32 → direct', index: 4 };
const CONDITION = 'source_ip_cidr';
const SUBNET = '192.168.1.0/24';
// The mock stand serves four devices with addresses in this subnet.
const SUBNET_DEVICES = 4;

test(
  'adds a source subnet to a rule by picking a suggestion',
  { tag: E2E_TAG.Mock },
  async ({ configPage, applyBar }) => {
    await configPage.goto();
    await configPage.openRule(RULE.title, RULE.index);

    await test.step('the source field offers the local network with its device count', async () => {
      await configPage.conditionField(CONDITION).click();

      const options = configPage.conditionSuggestions(CONDITION).getByRole('option');

      await expect(options).toHaveCount(1);
      await expect(options).toContainText(SUBNET);
      await expect(options).toContainText(
        translate('features/Rule/RuleEdit', 'suggestion.lan', { count: SUBNET_DEVICES })
      );
    });

    await test.step('a picked subnet becomes a chip and the field stays ready for the next value', async () => {
      await configPage.conditionSuggestions(CONDITION).getByRole('option').filter({ hasText: SUBNET }).click();

      await expect(configPage.conditionChips(CONDITION).getByRole('listitem')).toHaveText(['192.168.1.100/32', SUBNET]);
      await expect(configPage.conditionField(CONDITION)).toBeFocused();
      await expect(configPage.conditionField(CONDITION)).toHaveValue('');
      await expect(applyBar.dirty).toBeVisible();
    });
  }
);
