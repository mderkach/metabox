import type { Locator, Page } from '@playwright/test';

import { translate } from '../lib/i18n.ts';

/** The overview screen: the verdict at its top. */
export class OverviewPage {
  readonly page: Page;
  readonly allWorks: Locator;

  constructor(page: Page) {
    this.page = page;
    this.allWorks = page.getByRole('status').filter({ hasText: translate('pages/Overview', 'verdict.ok') });
  }

  async goto() {
    await this.page.goto('/overview');
  }
}
