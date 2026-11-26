import type { Locator, Page } from '@playwright/test';

import { CONNECTIONS_NS } from '../../src/pages/Connections/i18n/Connections.namespace.generated.ts';
import { CONNECTION_TABLE_NS } from '../../src/widgets/ConnectionTable/i18n/ConnectionTable.namespace.generated.ts';
import { translate } from '../lib/i18n.ts';

/** The connections screen: its tabs, the search, the sortable column headers and the row actions. */
export class ConnectionsPage {
  readonly page: Page;
  readonly activeTab: Locator;
  readonly closedTab: Locator;
  readonly search: Locator;

  constructor(page: Page) {
    this.page = page;
    this.activeTab = page.getByRole('tab', { name: translate(CONNECTIONS_NS, 'tab.active') });
    this.closedTab = page.getByRole('tab', { name: translate(CONNECTIONS_NS, 'tab.closed') });
    this.search = page.getByRole('textbox', { name: translate(CONNECTIONS_NS, 'search.label') });
  }

  async goto() {
    await this.page.goto('/connections');
  }

  /** The sort button of a column, by the key of its label in the table dictionary. */
  sortButton(column: 'column.volume' | 'column.host'): Locator {
    return this.page
      .getByRole('columnheader')
      .getByRole('button', { name: translate(CONNECTION_TABLE_NS, column), exact: true });
  }

  /** A connection is found by its address through the button that explains its route. */
  explainButton(host: string): Locator {
    return this.page.getByRole('button', { name: translate(CONNECTION_TABLE_NS, 'row.explain', { host }) });
  }
}
