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

  normHeader(group: string): Locator {
    return this.group(group).getByText(translate(PROXY_GROUPS, 'metadata.autoDefault'), { exact: true });
  }

  normField(tag: string): Locator {
    return this.page.getByRole('textbox', {
      name: translate(PROXY_GROUPS, 'metadata.normField', { tag }),
      exact: true,
    });
  }

  normRow(tag: string): Locator {
    return this.page.locator('[data-slot="proxy-node-row"]').filter({ has: this.normField(tag) });
  }

  normCell(tag: string, cell: 'identity' | 'delay' | 'reading' | 'status' | 'norm' | 'meter'): Locator {
    return this.normRow(tag).locator(`[data-slot="proxy-node-${cell}"]`);
  }

  editNorm(tag: string): Locator {
    return this.normButton(tag, 'metadata.editNorm');
  }

  saveNorm(tag: string): Locator {
    return this.normButton(tag, 'metadata.saveNorm');
  }

  resetNorm(tag: string): Locator {
    return this.normButton(tag, 'metadata.resetNorm');
  }

  addManualChoiceButton(group: string): Locator {
    return this.page.getByRole('button', { name: translate(PROXY_GROUPS, 'auto.actionLabel', { group }) });
  }

  private normButton(tag: string, key: string): Locator {
    return this.normRow(tag).getByRole('button', { name: translate(PROXY_GROUPS, key, { tag }), exact: true });
  }
}
