import type { Locator, Page } from '@playwright/test';

import { OVERVIEW_NS } from '../../src/pages/Overview/i18n/Overview.namespace.generated.ts';
import { translate } from '../lib/i18n.ts';

export class OverviewPage {
  readonly page: Page;
  readonly allWorks: Locator;

  constructor(page: Page) {
    this.page = page;
    this.allWorks = page.getByRole('status').filter({ hasText: translate(OVERVIEW_NS, 'verdict.ok') });
  }

  async goto() {
    await this.page.goto('/overview');
  }
}
