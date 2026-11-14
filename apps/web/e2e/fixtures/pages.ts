import { test as base } from '@playwright/test';

import { ApplyBar } from '../pages/ApplyBar.ts';
import { ConfigPage } from '../pages/ConfigPage.ts';
import { SectionPage } from '../pages/SectionPage.ts';
import { SettingsPage } from '../pages/SettingsPage.ts';

export const test = base.extend<{
  applyBar: ApplyBar;
  configPage: ConfigPage;
  sectionPage: SectionPage;
  settingsPage: SettingsPage;
}>({
  applyBar: async ({ page }, use) => {
    await use(new ApplyBar(page));
  },
  configPage: async ({ page }, use) => {
    await use(new ConfigPage(page));
  },
  sectionPage: async ({ page }, use) => {
    await use(new SectionPage(page));
  },
  settingsPage: async ({ page }, use) => {
    await use(new SettingsPage(page));
  },
});
