import { E2E_TAG, expect, test, translate } from './fixtures/index.ts';

const RULE_EDIT = 'features/Rule/RuleEdit';
const RULE = { title: '192.168.1.100/32 → direct', index: 4 };
const CONDITION = 'source_ip_cidr';
// A device of the mock stand: its name on the option and the chip, its address as the condition value.
const DEVICE = { name: 'iphone-guest', ip: '192.168.1.120' };

test(
  'adds a source device to a rule by picking it from the suggestions',
  { tag: E2E_TAG.Mock },
  async ({ configPage, applyBar }) => {
    await configPage.goto();
    await configPage.openRule(RULE.title, RULE.index);

    const suggestions = configPage.conditionSuggestions(CONDITION);
    const devices = suggestions.getByRole('group', { name: translate(RULE_EDIT, 'suggestion.group.devices') });
    const networks = suggestions.getByRole('group', { name: translate(RULE_EDIT, 'suggestion.group.networks') });

    await test.step('the source field offers devices, and no network around the address already in it', async () => {
      await configPage.conditionField(CONDITION).click();

      await expect(devices.getByRole('option', { name: `${DEVICE.name} ${DEVICE.ip}` })).toBeVisible();
      await expect(networks).toBeHidden();
    });

    await test.step('a picked device becomes a chip with its name and the field stays ready', async () => {
      await devices.getByRole('option', { name: `${DEVICE.name} ${DEVICE.ip}` }).click();

      await expect(configPage.conditionChips(CONDITION).getByRole('listitem')).toHaveText([
        '192.168.1.100/32',
        `${DEVICE.name} ${DEVICE.ip}/32`,
      ]);
      await expect(configPage.conditionField(CONDITION)).toBeFocused();
      await expect(devices.getByRole('option', { name: `${DEVICE.name} ${DEVICE.ip}` })).toBeHidden();
      await expect(applyBar.dirty).toBeVisible();
    });
  }
);
