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

  group(tag: string): Locator {
    return this.page.getByRole('group', { name: tag, exact: true });
  }

  groupHeading(tag: string): Locator {
    return this.group(tag).getByRole('heading', { name: tag, exact: true });
  }

  testGroup(tag: string): Locator {
    return this.group(tag).getByRole('button', { name: translate(PROXY_GROUPS, 'card.testGroup', { group: tag }) });
  }

  editGroupLabel(tag: string): Locator {
    return this.group(tag).getByRole('button', { name: translate(PROXY_GROUPS, 'metadata.editLabel', { tag }) });
  }

  groupLabelField(tag: string): Locator {
    return this.group(tag).getByRole('textbox', { name: translate(PROXY_GROUPS, 'metadata.label'), exact: true });
  }

  addManualChoiceButton(group: string): Locator {
    return this.page.getByRole('button', { name: translate(PROXY_GROUPS, 'auto.actionLabel', { group }) });
  }
}
