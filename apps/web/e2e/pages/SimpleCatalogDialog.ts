import type { Locator, Page } from '@playwright/test';

import { translate } from '../lib/i18n.ts';

const CATALOG = 'features/Rule/RuleCatalogAdd';

export class SimpleCatalogDialog {
  readonly page: Page;
  readonly trigger: Locator;
  readonly dialog: Locator;
  readonly search: Locator;
  readonly outbound: Locator;
  readonly resolver: Locator;
  readonly submit: Locator;
  readonly done: Locator;
  readonly cancel: Locator;

  constructor(page: Page) {
    this.page = page;
    const rules = page.getByRole('region', { name: translate('pages/SimpleRoutes', 'sections.rules'), exact: true });
    this.trigger = rules.getByRole('button', { name: translate('pages/SimpleRoutes', 'catalog.action'), exact: true });
    this.dialog = page.getByRole('dialog', { name: translate(CATALOG, 'title'), exact: true });
    this.search = this.dialog.getByRole('searchbox', { name: translate(CATALOG, 'search'), exact: true });
    this.outbound = this.dialog.getByRole('combobox', { name: translate(CATALOG, 'outbound'), exact: true });
    this.resolver = this.dialog.getByRole('combobox', { name: translate(CATALOG, 'resolver'), exact: true });
    this.submit = this.dialog.getByRole('button', { name: translate(CATALOG, 'submit'), exact: true });
    this.done = this.dialog.getByRole('button', { name: translate(CATALOG, 'done'), exact: true });
    this.cancel = this.dialog.getByRole('button', { name: translate(CATALOG, 'cancel'), exact: true });
  }

  service(category: string, provider: string) {
    return this.dialog.getByRole('radio', { name: `${category} ${provider} · geosite`, exact: true });
  }

  async select(control: Locator, tag: string) {
    await control.click();
    await this.page.getByRole('option', { name: tag, exact: true }).click();
  }
}
