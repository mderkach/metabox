import type { Locator, Page } from '@playwright/test';

import { PROXY_GROUPS_NS } from '../../src/widgets/ProxyGroups/i18n/ProxyGroups.namespace.generated.ts';
import { translate } from '../lib/i18n.ts';

/** The proxies screen: group cards and the manual choice offered over an automatic group. */
export class ProxiesPage {
  readonly page: Page;
  readonly manualChoiceAdded: Locator;

  constructor(page: Page) {
    this.page = page;
    this.manualChoiceAdded = page.getByRole('status').filter({ hasText: translate(PROXY_GROUPS_NS, 'auto.added') });
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
    return this.group(tag).getByRole('button', { name: translate(PROXY_GROUPS_NS, 'card.testGroup', { group: tag }) });
  }

  editGroupLabel(tag: string): Locator {
    return this.group(tag).getByRole('button', { name: translate(PROXY_GROUPS_NS, 'metadata.editLabel', { tag }) });
  }

  groupLabelField(tag: string): Locator {
    return this.group(tag).getByRole('textbox', { name: translate(PROXY_GROUPS_NS, 'metadata.label'), exact: true });
  }

  normHeader(group: string): Locator {
    return this.group(group).getByText(translate(PROXY_GROUPS_NS, 'metadata.autoDefault'), { exact: true });
  }

  normField(tag: string): Locator {
    return this.page.getByRole('textbox', {
      name: translate(PROXY_GROUPS_NS, 'metadata.normField', { tag }),
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
    return this.page.getByRole('button', { name: translate(PROXY_GROUPS_NS, 'auto.actionLabel', { group }) });
  }

  private normButton(tag: string, key: string): Locator {
    return this.normRow(tag).getByRole('button', { name: translate(PROXY_GROUPS_NS, key, { tag }), exact: true });
  }
}
