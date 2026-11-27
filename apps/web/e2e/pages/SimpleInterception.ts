import type { Locator, Page } from '@playwright/test';

import { DEVICE_ROUTE_NS } from '../../src/features/Device/DeviceRoute/i18n/DeviceRoute.namespace.generated.ts';
import { SIMPLE_ROUTES_NS } from '../../src/pages/SimpleRoutes/i18n/SimpleRoutes.namespace.generated.ts';
import { translate } from '../lib/i18n.ts';

export class SimpleInterception {
  readonly settings: Locator;
  readonly current: Locator;
  readonly picker: Locator;
  readonly review: Locator;
  readonly preview: Locator;
  readonly start: Locator;
  readonly listed: Locator;
  readonly all: Locator;
  readonly reset: Locator;
  readonly keep: Locator;
  readonly progress: Locator;
  readonly rolledBack: Locator;
  readonly proxy: Locator;
  readonly scope: Locator;

  constructor(page: Page, scope: Locator) {
    this.scope = scope;
    const text = (key: string) => translate(DEVICE_ROUTE_NS, key);
    this.settings = scope.locator('summary').filter({ hasText: translate(SIMPLE_ROUTES_NS, 'interception.settings') });
    this.current = scope.getByRole('heading', { name: text('scope.current') });
    this.picker = scope.locator('summary').filter({ hasText: text('scope.pick') });
    this.listed = scope.getByRole('radio', { name: text('scope.mode.listed'), exact: true });
    this.all = scope.getByRole('radio', { name: text('scope.mode.all'), exact: true });
    this.review = scope.getByRole('button', { name: text('scope.review'), exact: true });
    this.preview = page.getByRole('dialog', { name: text('scope.review') });
    this.start = this.preview.getByRole('button', { name: text('scope.apply'), exact: true });
    this.reset = scope.getByRole('button', { name: text('scope.reset') });
    this.progress = page.getByRole('region', { name: text('bar.label') });
    this.keep = this.progress.getByRole('button', { name: text('bar.submit') });
    this.rolledBack = this.progress.getByText(text('failure.rolledBack'), { exact: true });
    this.proxy = scope.locator('summary').filter({ hasText: translate(SIMPLE_ROUTES_NS, 'proxyAccess.disclosure') });
  }

  device(name: string) {
    return this.scope.getByRole('checkbox', { name: new RegExp(name) });
  }
}
