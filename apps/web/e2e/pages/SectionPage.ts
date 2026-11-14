import type { Locator, Page } from '@playwright/test';

import { translate } from '../lib/i18n.ts';

const NODE_FORM = 'features/Config/ConfigNodeForm';

/** A config section screen with a node list, such as DNS servers, and the side panel of the open node. */
export class SectionPage {
  readonly page: Page;
  readonly closePanel: Locator;

  constructor(page: Page) {
    this.page = page;
    this.closePanel = page.getByRole('button', { name: translate('shared', 'action.closePanel') });
  }

  async goto(section: string) {
    await this.page.goto(`/config/${section}`);
  }

  /** The panel of an open node is named after the node. */
  panel(name: string): Locator {
    return this.page.getByRole('complementary', { name, exact: true });
  }

  serverField(name: string): Locator {
    return this.panel(name).getByRole('textbox', { name: translate(NODE_FORM, 'label.server'), exact: true });
  }

  async openNode(name: string) {
    await this.page.getByRole('button', { name, exact: true }).click();
  }
}
