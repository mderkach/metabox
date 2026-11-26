import type { Locator, Page } from '@playwright/test';

import { CONFIG_NODE_FORM_NS } from '../../src/features/Config/ConfigNodeForm/i18n/ConfigNodeForm.namespace.generated.ts';
import { SHARED_NS } from '../../src/shared/i18n/Shared.namespace.generated.ts';
import { translate } from '../lib/i18n.ts';

export class SectionPage {
  readonly page: Page;
  readonly closePanel: Locator;

  constructor(page: Page) {
    this.page = page;
    this.closePanel = page.getByRole('button', { name: translate(SHARED_NS, 'action.closePanel') });
  }

  async goto(section: string) {
    await this.page.goto(`/config/${section}`);
  }

  /** The panel of an open node is named after the node. */
  panel(name: string): Locator {
    return this.page.getByRole('complementary', { name, exact: true });
  }

  serverField(name: string): Locator {
    return this.panel(name).getByRole('textbox', { name: translate(CONFIG_NODE_FORM_NS, 'label.server'), exact: true });
  }

  async openNode(name: string) {
    await this.page.getByRole('button', { name, exact: true }).click();
  }
}
