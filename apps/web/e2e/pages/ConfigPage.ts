import type { Locator, Page } from '@playwright/test';

import { RULE_EDIT_NS } from '../../src/features/Rule/RuleEdit/i18n/RuleEdit.namespace.generated.ts';
import { SHARED_NS } from '../../src/shared/i18n/Shared.namespace.generated.ts';
import { RULE_TABLE_NS } from '../../src/widgets/Rule/RuleTable/i18n/RuleTable.namespace.generated.ts';
import { translate } from '../lib/i18n.ts';

/** The routing tab of the config editor: the rule table and the side panel of the open rule. */
export class ConfigPage {
  readonly page: Page;
  readonly rules: Locator;
  readonly ruleName: Locator;

  constructor(page: Page) {
    this.page = page;
    this.rules = page.getByRole('table', { name: translate(RULE_TABLE_NS, 'label') });
    this.ruleName = page.getByLabel(translate(RULE_EDIT_NS, 'field.name.label'), { exact: true });
  }

  async goto() {
    await this.page.goto('/config');
  }

  /** `title` is what the row shows for the rule: its name, or `<conditions> → <target>` without one. */
  ruleRow(title: string, index: number): Locator {
    const name = translate(RULE_TABLE_NS, 'row.label', { title, index });

    return this.rules.getByRole('button', { name, exact: true });
  }

  /** The row of a rule the draft changed: its name says so after the number. */
  editedRuleRow(title: string, index: number): Locator {
    const name = `${translate(RULE_TABLE_NS, 'row.label', { title, index })}, ${translate(RULE_TABLE_NS, 'row.edited')}`;

    return this.rules.getByRole('button', { name, exact: true });
  }

  async openRule(title: string, index: number) {
    await this.ruleRow(title, index).click();
  }

  /** The chip field of a rule condition by its key, such as `source_ip_cidr`. */
  conditionField(condition: string): Locator {
    return this.page.getByRole('combobox', {
      name: translate(RULE_EDIT_NS, `condition.${condition}.label`),
      exact: true,
    });
  }

  conditionSuggestions(condition: string): Locator {
    const label = translate(RULE_EDIT_NS, `condition.${condition}.label`);

    return this.page.getByRole('listbox', { name: translate(SHARED_NS, 'tokenInput.suggestions', { label }) });
  }

  conditionChips(condition: string): Locator {
    const label = translate(RULE_EDIT_NS, `condition.${condition}.label`);

    return this.page.getByRole('list', { name: translate(SHARED_NS, 'tokenInput.values', { label }) });
  }
}
