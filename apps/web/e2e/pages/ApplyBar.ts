import type { Locator, Page } from '@playwright/test';

import { CONFIG_APPLY_NS } from '../../src/features/Config/ConfigApply/i18n/ConfigApply.namespace.generated.ts';
import { SHARED_NS } from '../../src/shared/i18n/Shared.namespace.generated.ts';
import { translate } from '../lib/i18n.ts';

export class ApplyBar {
  readonly page: Page;
  readonly region: Locator;
  readonly dirty: Locator;
  readonly applyButton: Locator;
  readonly more: Locator;
  readonly discard: Locator;
  readonly confirmPrompt: Locator;
  readonly diff: Locator;
  readonly ruleChanges: Locator;
  readonly nodeChanges: Locator;
  readonly keepButton: Locator;
  readonly confirmed: Locator;

  constructor(page: Page) {
    this.page = page;
    this.region = page.getByRole('region', { name: translate(CONFIG_APPLY_NS, 'bar.label') });
    this.dirty = this.region.getByText(translate(CONFIG_APPLY_NS, 'bar.dirty'));
    this.applyButton = this.region.getByRole('button', { name: translate(CONFIG_APPLY_NS, 'bar.apply'), exact: true });
    this.more = this.region.getByRole('button', { name: translate(CONFIG_APPLY_NS, 'bar.more') });
    this.discard = page.getByRole('menuitem', { name: translate(CONFIG_APPLY_NS, 'bar.discard') });
    this.confirmPrompt = this.region
      .getByRole('status')
      .filter({ hasText: translate(CONFIG_APPLY_NS, 'confirm.prompt') });
    this.diff = page.getByRole('dialog', { name: translate(CONFIG_APPLY_NS, 'diff.title') });
    this.ruleChanges = this.diff.getByRole('list', { name: translate(CONFIG_APPLY_NS, 'diff.rules.label') });
    this.nodeChanges = this.diff.getByRole('list', { name: translate(CONFIG_APPLY_NS, 'changes.label') });
    this.keepButton = this.region.getByRole('button', { name: translate(CONFIG_APPLY_NS, 'confirm.submit') });
    this.confirmed = page.getByText(translate(SHARED_NS, 'toast.apply.confirm.done'));
  }

  async apply() {
    await this.applyButton.click();
  }

  /** Unfolds the line diff under the summary; `lines` can match the displayed count. */
  async showChangesText(lines?: number) {
    const plural = translate(CONFIG_APPLY_NS, 'diff.changed', { count: 0 }).replace('0', '\\d+');
    const name =
      lines === undefined ? new RegExp(plural) : translate(CONFIG_APPLY_NS, 'diff.changed', { count: lines });
    await this.diff.getByRole('button', { name }).click();
  }

  async confirmDiff() {
    await this.diff.getByRole('button', { name: translate(CONFIG_APPLY_NS, 'bar.apply'), exact: true }).click();
  }

  remainingSeconds(seconds: number): Locator {
    const text = translate(CONFIG_APPLY_NS, 'confirm.left', { seconds }).match(/<time>([^<]+)<\/time>/)?.[1];
    if (text === undefined) throw new Error('Confirmation countdown is missing the time text');

    return this.region.getByText(text, { exact: true });
  }

  async keep() {
    await this.keepButton.click();
  }
}
