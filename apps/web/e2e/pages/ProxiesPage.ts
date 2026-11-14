import type { Locator, Page } from '@playwright/test';

import { translate } from '../lib/i18n.ts';

const PROXY_GROUPS = 'widgets/ProxyGroups';

/** The proxies screen: group cards and the manual choice offered over an automatic group. */
export class ProxiesPage {
  readonly page: Page;
  readonly manualChoiceAdded: Locator;

  constructor(page: Page) {
    this.page = page;
    this.manualChoiceAdded = page.getByRole('status').filter({ hasText: translate(PROXY_GROUPS, 'auto.added') });
  }

  async goto() {
    await this.page.goto('/proxies');
  }

  addManualChoiceButton(group: string): Locator {
    return this.page.getByRole('button', { name: translate(PROXY_GROUPS, 'auto.actionLabel', { group }) });
  }
}
