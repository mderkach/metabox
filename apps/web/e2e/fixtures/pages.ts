import { test as base } from '@playwright/test';

import { ApplyBar } from '../pages/ApplyBar.ts';
import { ConfigPage } from '../pages/ConfigPage.ts';
import { ProxiesPage } from '../pages/ProxiesPage.ts';

export const test = base.extend<{ applyBar: ApplyBar; configPage: ConfigPage; proxiesPage: ProxiesPage }>({
  applyBar: async ({ page }, use) => {
    await use(new ApplyBar(page));
  },
  configPage: async ({ page }, use) => {
    await use(new ConfigPage(page));
  },
  proxiesPage: async ({ page }, use) => {
    await use(new ProxiesPage(page));
  },
});
