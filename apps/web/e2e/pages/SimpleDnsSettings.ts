import type { Locator, Page } from '@playwright/test';

import { CONFIG_DNS_EDIT_NS } from '../../src/features/Config/ConfigDnsEdit/i18n/ConfigDnsEdit.namespace.generated.ts';
import { SIMPLE_ROUTES_NS } from '../../src/pages/SimpleRoutes/i18n/SimpleRoutes.namespace.generated.ts';
import { SHARED_NS } from '../../src/shared/i18n/Shared.namespace.generated.ts';
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
  readonly unassigned = translate(CONFIG_DNS_EDIT_NS, 'dns.unassigned');
  readonly noResolver = translate(CONFIG_DNS_EDIT_NS, 'dns.reason.resolver');
  readonly region: Locator;
  readonly page: Page;

  constructor(page: Page, routes: SimpleRoutesPage) {
    this.page = page;
    this.region = routes.dns;
    this.settings = this.region.getByText(translate(SIMPLE_ROUTES_NS, 'dns.settings'), { exact: true });
    this.assignments = this.region.getByRole('heading', { name: translate(CONFIG_DNS_EDIT_NS, 'dns.assignment') });
    this.add = this.region.getByRole('button', { name: translate(CONFIG_DNS_EDIT_NS, 'dns.add'), exact: true });
    this.name = this.region.getByRole('textbox', { name: translate(CONFIG_DNS_EDIT_NS, 'dns.field.tag'), exact: true });
    this.address = this.region.getByRole('textbox', {
      name: translate(CONFIG_DNS_EDIT_NS, 'dns.field.address'),
      exact: true,
    });
    this.detour = this.region.getByRole('combobox', {
      name: translate(CONFIG_DNS_EDIT_NS, 'dns.field.detour'),
      exact: true,
    });
    this.stage = this.region.getByRole('button', { name: translate(SHARED_NS, 'action.addToDraft'), exact: true });
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
