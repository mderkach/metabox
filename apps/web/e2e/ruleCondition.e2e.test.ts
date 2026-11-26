import { RULE_EDIT_NS } from '../src/features/Rule/RuleEdit/i18n/RuleEdit.namespace.generated.ts';
import { E2E_TAG, expect, test, translate } from './fixtures/index.ts';

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
    const devices = suggestions.getByRole('group', { name: translate(RULE_EDIT_NS, 'suggestion.group.devices') });
    const networks = suggestions.getByRole('group', { name: translate(RULE_EDIT_NS, 'suggestion.group.networks') });

    await test.step('the source field offers devices, and no network around the address already in it', async () => {
      await configPage.conditionField(CONDITION).click();

      await expect(devices.getByRole('option', { name: `${DEVICE.name} ${DEVICE.ip}` })).toBeVisible();
      await expect(networks).toBeHidden();
    });

    await test.step('a picked device becomes a chip with its name and the field stays ready', async () => {
      await devices.getByRole('option', { name: `${DEVICE.name} ${DEVICE.ip}` }).click();
      await expect(devices.getByRole('option', { name: `${DEVICE.name} ${DEVICE.ip}` })).toBeHidden();
      // An open list hides the rest of the form from assistive tech; the chips are read after it closes.
      await configPage.page.keyboard.press('Escape');

      await expect(configPage.conditionChips(CONDITION).getByRole('listitem')).toHaveText([
        '192.168.1.100/32',
        `${DEVICE.name} ${DEVICE.ip}/32`,
      ]);
      await expect(configPage.conditionField(CONDITION)).toBeFocused();
      await expect(applyBar.dirty).toBeVisible();
    });
  }
);

// These measurements run in Chromium; the e2e project is typed without the DOM library.
const SCROLL_SHEET_TO_END = `(input) => {
  for (let parent = input.parentElement; parent !== null; parent = parent.parentElement) {
    if (getComputedStyle(parent).overflowY === 'auto' && parent.scrollHeight > parent.clientHeight) {
      parent.scrollTop = parent.scrollHeight;
      return;
    }
  }
}`;

const COUNT_VISIBLE_TOUCH_OPTIONS = `(list, touchTargetSize) => {
  const popup = list.parentElement?.getBoundingClientRect();
  if (popup === undefined) return 0;

  return Array.from(list.querySelectorAll('[role=option]')).filter((option) => {
    const bounds = option.getBoundingClientRect();
    const center = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);

    return bounds.height >= touchTargetSize && bounds.top >= popup.top &&
      bounds.bottom <= Math.min(popup.bottom, window.innerHeight) && option.contains(center);
  }).length;
}`;

const TOUCH_TARGET_SIZE = 44;
const MIN_VISIBLE_OPTIONS = 3;

test.describe('rule conditions in a phone sheet', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test('shows three touch options at the bottom of the rule sheet', { tag: E2E_TAG.Mock }, async ({ configPage }) => {
    await configPage.goto();
    await configPage.openRule(RULE.title, RULE.index);
    const field = configPage.conditionField(CONDITION);
    const page = configPage.page;
    const fieldId = await field.getAttribute('id');
    await page.evaluate<void>(`(${SCROLL_SHEET_TO_END})(document.getElementById(${JSON.stringify(fieldId)}))`);

    await field.tap();
    const suggestions = configPage.conditionSuggestions(CONDITION);
    await expect(suggestions).toBeVisible();
    const listId = await suggestions.getAttribute('id');
    await expect
      .poll(async () =>
        page.evaluate<number>(
          `(${COUNT_VISIBLE_TOUCH_OPTIONS})(document.getElementById(${JSON.stringify(listId)}), ${TOUCH_TARGET_SIZE})`
        )
      )
      .toBeGreaterThanOrEqual(MIN_VISIBLE_OPTIONS);

    const option = suggestions.getByRole('option', { name: `${DEVICE.name} ${DEVICE.ip}` });
    await option.tap();
    await configPage.page.keyboard.press('Escape');
    await expect(field).toBeFocused();
    await expect(configPage.conditionChips(CONDITION).getByText(DEVICE.name)).toBeVisible();
  });
});
