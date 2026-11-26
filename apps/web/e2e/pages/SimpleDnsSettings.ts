import type { Locator, Page } from '@playwright/test';

import { SIMPLE_ROUTES_NS } from '../../src/pages/SimpleRoutes/i18n/SimpleRoutes.namespace.generated.ts';
import { translate } from '../lib/i18n.ts';
import type { SimpleRoutesPage } from './SimpleRoutesPage.ts';

export class SimpleDnsSettings {
  readonly settings: Locator;
  readonly assignments: Locator;
  readonly add: Locator;
  readonly name: Locator;
  readonly address: Locator;
  readonly detour: Locator;
  readonly stage: Locator;
  readonly unassigned = translate(SIMPLE_ROUTES_NS, 'dns.unassigned');
  readonly noResolver = translate(SIMPLE_ROUTES_NS, 'dns.reason.resolver');
  readonly region: Locator;
  readonly page: Page;

  constructor(page: Page, routes: SimpleRoutesPage) {
    this.page = page;
    this.region = routes.dns;
    this.settings = this.region.getByText(translate(SIMPLE_ROUTES_NS, 'dns.settings'), { exact: true });
    this.assignments = this.region.getByRole('heading', { name: translate(SIMPLE_ROUTES_NS, 'dns.assignment') });
    this.add = this.region.getByRole('button', { name: translate(SIMPLE_ROUTES_NS, 'dns.add'), exact: true });
    this.name = this.region.getByRole('textbox', { name: translate(SIMPLE_ROUTES_NS, 'dns.field.tag'), exact: true });
    this.address = this.region.getByRole('textbox', {
      name: translate(SIMPLE_ROUTES_NS, 'dns.field.address'),
      exact: true,
    });
    this.detour = this.region.getByRole('combobox', {
      name: translate(SIMPLE_ROUTES_NS, 'dns.field.detour'),
      exact: true,
    });
    this.stage = this.region.getByRole('button', { name: translate(SIMPLE_ROUTES_NS, 'custom.submit'), exact: true });
  }

  inventoryRow(tag: string) {
    return this.region.getByRole('listitem').filter({ has: this.page.getByText(tag, { exact: true }) });
  }

  pathRow(domain: string) {
    return this.region.getByRole('listitem').filter({ hasText: domain });
  }

  assignment(domain: string) {
    return this.pathRow(domain).getByRole('combobox');
  }

  async select(field: Locator, tag: string) {
    await field.click();
    await this.page.getByRole('option', { name: tag, exact: true }).click();
  }
}
