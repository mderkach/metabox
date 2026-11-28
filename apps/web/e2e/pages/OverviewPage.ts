import type { Locator, Page } from '@playwright/test';

import { OVERVIEW_NS } from '../../src/pages/Overview/i18n/Overview.namespace.generated.ts';
import { SHARED_NS } from '../../src/shared/i18n/Shared.namespace.generated.ts';
import { translate } from '../lib/i18n.ts';

export class OverviewPage {
  readonly page: Page;
  readonly allWorks: Locator;
  readonly outbounds: Locator;
  readonly trafficShares: Locator;
  readonly trafficPeriod: Locator;

  constructor(page: Page) {
    this.page = page;
    this.allWorks = page.getByRole('status').filter({ hasText: translate(OVERVIEW_NS, 'verdict.ok') });
    this.outbounds = page.getByRole('table', { name: translate(OVERVIEW_NS, 'outbounds.title') });
    this.trafficShares = page.getByLabel(translate(OVERVIEW_NS, 'traffic.shares'));
    this.trafficPeriod = page.getByText(
      translate(OVERVIEW_NS, 'traffic.uplinkSince', { age: translate(SHARED_NS, 'unit.minute', { value: 10 }) })
    );
  }

  async goto() {
    await this.page.goto('/overview');
  }
}
