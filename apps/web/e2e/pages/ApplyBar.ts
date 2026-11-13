import type { Locator, Page } from '@playwright/test';

import { translate } from '../lib/i18n.ts';

const CONFIG_APPLY = 'features/Config/ConfigApply';

/** The apply bar at the bottom of the panel, its diff dialog and the confirmation window. */
export class ApplyBar {
  readonly page: Page;
  readonly region: Locator;
  readonly dirty: Locator;
  readonly diff: Locator;
  readonly keepButton: Locator;
  readonly confirmed: Locator;

  constructor(page: Page) {
    this.page = page;
    this.region = page.getByRole('region', { name: translate(CONFIG_APPLY, 'bar.label') });
    this.dirty = this.region.getByText(translate(CONFIG_APPLY, 'bar.dirty'));
    this.diff = page.getByRole('dialog', { name: translate(CONFIG_APPLY, 'diff.title') });
    this.keepButton = this.region.getByRole('button', { name: translate(CONFIG_APPLY, 'confirm.submit') });
    this.confirmed = page.getByText(translate('shared', 'toast.apply.confirm.done'));
  }

  async apply() {
    await this.region.getByRole('button', { name: translate(CONFIG_APPLY, 'bar.apply'), exact: true }).click();
  }

  async confirmDiff() {
    await this.diff.getByRole('button', { name: translate(CONFIG_APPLY, 'bar.apply'), exact: true }).click();
  }

  async keep() {
    await this.keepButton.click();
  }
}
