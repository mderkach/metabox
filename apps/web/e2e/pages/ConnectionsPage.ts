import type { Locator, Page } from '@playwright/test';

import { translate } from '../lib/i18n.ts';

const CONNECTION_TABLE = 'widgets/ConnectionTable';

/** The connections screen: a connection is found by its address through its row action. */
export class ConnectionsPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto() {
    await this.page.goto('/connections');
  }

  explainButton(host: string): Locator {
    return this.page.getByRole('button', { name: translate(CONNECTION_TABLE, 'row.explain', { host }) });
  }
}
