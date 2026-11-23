import type { Locator, Page } from '@playwright/test';

import { translate } from '../lib/i18n.ts';
import type { SimpleRoutesPage } from './SimpleRoutesPage.ts';

const SIMPLE = 'pages/SimpleRoutes';
const REORDER = 'features/Rule/RuleReorder';
const SET = 'widgets/RuleSet/RuleSetTable';

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
    this.byOrder = rules.getByRole('button', { name: translate(SIMPLE, 'list.byOrder'), exact: true });
    this.byType = rules.getByRole('button', { name: translate(SIMPLE, 'list.byType'), exact: true });
    this.filter = rules.getByRole('combobox', { name: translate(SIMPLE, 'list.filter'), exact: true });
    this.clearFilter = rules.getByRole('link', { name: translate(SIMPLE, 'rules.clear'), exact: true });
    this.addSite = rules.getByRole('button', { name: translate(SIMPLE, 'custom.add'), exact: true });
    this.form = page.getByRole('dialog');
    this.address = this.form.getByRole('textbox', { name: translate(SIMPLE, 'custom.address'), exact: true });
    this.device = this.form.getByRole('combobox', { name: translate(SIMPLE, 'custom.device'), exact: true });
    this.outbound = this.form.getByRole('combobox', { name: translate(SIMPLE, 'custom.outbound'), exact: true });
    this.submit = this.form.getByRole('button', { name: translate(SIMPLE, 'custom.submit'), exact: true });
  }

  row(subject: string) {
    return this.routes.rules.getByRole('listitem').filter({ hasText: subject });
  }

  service(tag: string) {
    return this.routes.rules.getByRole('button', { name: tag, exact: true });
  }

  reference(row: Locator, number: number) {
    return row.getByRole('link', { name: translate(SET, 'details.rule', { number }), exact: true });
  }

  move(index: number, direction: 'up' | 'down') {
    return this.routes.rules.getByRole('button', { name: translate(REORDER, direction, { index }), exact: true });
  }

  drag(index: number) {
    return this.routes.rules.getByRole('img', { name: translate(SIMPLE, 'list.drag', { index }), exact: true });
  }

  exception(subject: string) {
    return this.row(subject).getByRole('button', { name: translate(SIMPLE, 'custom.exception'), exact: true });
  }

  async select(field: Locator, name: string | RegExp) {
    await field.click();
    await this.page.getByRole('option', { name, exact: typeof name === 'string' }).click();
  }
}
