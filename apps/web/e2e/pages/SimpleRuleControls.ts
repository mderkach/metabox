import type { Locator, Page } from '@playwright/test';

import { RULE_REORDER_NS } from '../../src/features/Rule/RuleReorder/i18n/RuleReorder.namespace.generated.ts';
import { SIMPLE_ROUTES_NS } from '../../src/pages/SimpleRoutes/i18n/SimpleRoutes.namespace.generated.ts';
import { RULE_SET_TABLE_NS } from '../../src/widgets/RuleSet/RuleSetTable/i18n/RuleSetTable.namespace.generated.ts';
import { translate } from '../lib/i18n.ts';
import type { SimpleRoutesPage } from './SimpleRoutesPage.ts';

export class SimpleRuleControls {
  readonly page: Page;
  readonly routes: SimpleRoutesPage;
  readonly byOrder: Locator;
  readonly byType: Locator;
  readonly clearFilter: Locator;
  readonly filter: Locator;
  readonly addSite: Locator;
  readonly form: Locator;
  readonly address: Locator;
  readonly device: Locator;
  readonly outbound: Locator;
  readonly submit: Locator;

  constructor(page: Page, routes: SimpleRoutesPage) {
    this.page = page;
    this.routes = routes;
    const { rules } = routes;
    this.byOrder = rules.getByRole('button', { name: translate(SIMPLE_ROUTES_NS, 'list.byOrder'), exact: true });
    this.byType = rules.getByRole('button', { name: translate(SIMPLE_ROUTES_NS, 'list.byType'), exact: true });
    this.filter = rules.getByRole('combobox', { name: translate(SIMPLE_ROUTES_NS, 'list.filter'), exact: true });
    this.clearFilter = rules.getByRole('link', { name: translate(SIMPLE_ROUTES_NS, 'rules.clear'), exact: true });
    this.addSite = rules.getByRole('button', { name: translate(SIMPLE_ROUTES_NS, 'custom.add'), exact: true });
    this.form = page.getByRole('dialog');
    this.address = this.form.getByRole('textbox', { name: translate(SIMPLE_ROUTES_NS, 'custom.address'), exact: true });
    this.device = this.form.getByRole('combobox', { name: translate(SIMPLE_ROUTES_NS, 'custom.device'), exact: true });
    this.outbound = this.form.getByRole('combobox', {
      name: translate(SIMPLE_ROUTES_NS, 'custom.outbound'),
      exact: true,
    });
    this.submit = this.form.getByRole('button', { name: translate(SIMPLE_ROUTES_NS, 'custom.submit'), exact: true });
  }

  row(subject: string) {
    return this.routes.rules.getByRole('listitem').filter({ hasText: subject });
  }

  service(tag: string) {
    return this.routes.rules.getByRole('button', { name: tag, exact: true });
  }

  reference(row: Locator, number: number) {
    return row.getByRole('link', { name: translate(RULE_SET_TABLE_NS, 'details.rule', { number }), exact: true });
  }

  move(index: number, direction: 'up' | 'down') {
    return this.routes.rules.getByRole('button', {
      name: translate(RULE_REORDER_NS, direction, { index }),
      exact: true,
    });
  }

  drag(index: number) {
    return this.routes.rules.getByRole('img', {
      name: translate(SIMPLE_ROUTES_NS, 'list.drag', { index }),
      exact: true,
    });
  }

  exception(subject: string) {
    return this.row(subject).getByRole('button', {
      name: translate(SIMPLE_ROUTES_NS, 'custom.exception'),
      exact: true,
    });
  }

  async select(field: Locator, name: string | RegExp) {
    await field.click();
    await this.page.getByRole('option', { name, exact: typeof name === 'string' }).click();
  }
}
