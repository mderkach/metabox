import type { Locator, Page } from '@playwright/test';

import { translate } from '../lib/i18n.ts';

const CONNECTIONS = 'pages/Connections';
const CONNECTION_TABLE = 'widgets/ConnectionTable';

/** The connections screen: its tabs, the search and the sortable column headers. */
export class ConnectionsPage {
  readonly page: Page;
  readonly activeTab: Locator;
  readonly closedTab: Locator;
  readonly search: Locator;

  constructor(page: Page) {
    this.page = page;
    this.activeTab = page.getByRole('tab', { name: translate(CONNECTIONS, 'tab.active') });
    this.closedTab = page.getByRole('tab', { name: translate(CONNECTIONS, 'tab.closed') });
    this.search = page.getByRole('textbox', { name: translate(CONNECTIONS, 'search.label') });
  }

  async goto() {
    await this.page.goto('/connections');
  }

  /** The sort button of a column, by the key of its label in the table dictionary. */
  sortButton(column: 'column.volume' | 'column.host'): Locator {
    return this.page
      .getByRole('columnheader')
      .getByRole('button', { name: translate(CONNECTION_TABLE, column), exact: true });
  }
}
