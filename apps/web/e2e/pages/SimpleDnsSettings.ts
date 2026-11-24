import type { Locator, Page } from '@playwright/test';

import { translate } from '../lib/i18n.ts';
import type { SimpleRoutesPage } from './SimpleRoutesPage.ts';

const DNS = 'pages/SimpleRoutes';

export class SimpleDnsSettings {
  readonly settings: Locator;
  readonly assignments: Locator;
  readonly add: Locator;
  readonly name: Locator;
  readonly address: Locator;
  readonly detour: Locator;
  readonly stage: Locator;
  readonly unassigned = translate(DNS, 'dns.unassigned');
  readonly noResolver = translate(DNS, 'dns.reason.resolver');
  readonly region: Locator;
  readonly page: Page;

  constructor(page: Page, routes: SimpleRoutesPage) {
    this.page = page;
    this.region = routes.dns;
    this.settings = this.region.getByText(translate(DNS, 'dns.settings'), { exact: true });
    this.assignments = this.region.getByRole('heading', { name: translate(DNS, 'dns.assignment') });
    this.add = this.region.getByRole('button', { name: translate(DNS, 'dns.add'), exact: true });
    this.name = this.region.getByRole('textbox', { name: translate(DNS, 'dns.field.tag'), exact: true });
    this.address = this.region.getByRole('textbox', { name: translate(DNS, 'dns.field.address'), exact: true });
    this.detour = this.region.getByRole('combobox', { name: translate(DNS, 'dns.field.detour'), exact: true });
    this.stage = this.region.getByRole('button', { name: translate(DNS, 'custom.submit'), exact: true });
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
