import type { Locator, Page } from '@playwright/test';

import { translate } from '../lib/i18n.ts';

const RULE_TABLE = 'widgets/Rule/RuleTable';
const RULE_EDIT = 'features/Rule/RuleEdit';

/** The routing tab of the config editor: the rule table and the side panel of the open rule. */
export class ConfigPage {
  readonly page: Page;
  readonly rules: Locator;
  readonly ruleName: Locator;

  constructor(page: Page) {
    this.page = page;
    this.rules = page.getByRole('table', { name: translate(RULE_TABLE, 'label') });
    this.ruleName = page.getByLabel(translate(RULE_EDIT, 'field.name.label'), { exact: true });
  }

  async goto() {
    await this.page.goto('/config');
  }

  /** `title` is what the row shows for the rule: its name, or `<conditions> → <target>` without one. */
  async openRule(title: string, index: number) {
    const name = translate(RULE_TABLE, 'row.label', { title, index });

    await this.rules.getByRole('button', { name, exact: true }).click();
  }
}
