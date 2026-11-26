import type { Locator, Page } from '@playwright/test';

import { RULE_CATALOG_ADD_NS } from '../../src/features/Rule/RuleCatalogAdd/i18n/RuleCatalogAdd.namespace.generated.ts';
import { SIMPLE_ROUTES_NS } from '../../src/pages/SimpleRoutes/i18n/SimpleRoutes.namespace.generated.ts';
import { translate } from '../lib/i18n.ts';

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
    const rules = page.getByRole('region', { name: translate(SIMPLE_ROUTES_NS, 'sections.rules'), exact: true });
    this.trigger = rules.getByRole('button', { name: translate(SIMPLE_ROUTES_NS, 'catalog.action'), exact: true });
    this.dialog = page.getByRole('dialog', { name: translate(RULE_CATALOG_ADD_NS, 'title'), exact: true });
    this.search = this.dialog.getByRole('searchbox', { name: translate(RULE_CATALOG_ADD_NS, 'search'), exact: true });
    this.outbound = this.dialog.getByRole('combobox', {
      name: translate(RULE_CATALOG_ADD_NS, 'outbound'),
      exact: true,
    });
    this.resolver = this.dialog.getByRole('combobox', {
      name: translate(RULE_CATALOG_ADD_NS, 'resolver'),
      exact: true,
    });
    this.submit = this.dialog.getByRole('button', { name: translate(RULE_CATALOG_ADD_NS, 'submit'), exact: true });
    this.done = this.dialog.getByRole('button', { name: translate(RULE_CATALOG_ADD_NS, 'done'), exact: true });
    this.cancel = this.dialog.getByRole('button', { name: translate(RULE_CATALOG_ADD_NS, 'cancel'), exact: true });
  }

  service(category: string, provider: string) {
    return this.dialog.getByRole('radio', { name: `${category} ${provider} · geosite`, exact: true });
  }

  async select(control: Locator, tag: string) {
    await control.click();
    await this.page.getByRole('option', { name: tag, exact: true }).click();
  }
}
