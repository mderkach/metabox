import { test as base } from '@playwright/test';

import { ApplyBar } from '../pages/ApplyBar.ts';
import { ConfigPage } from '../pages/ConfigPage.ts';
import { ConnectionsPage } from '../pages/ConnectionsPage.ts';
import { OverviewPage } from '../pages/OverviewPage.ts';
import { ProxiesPage } from '../pages/ProxiesPage.ts';
import { SectionPage } from '../pages/SectionPage.ts';
import { SettingsPage } from '../pages/SettingsPage.ts';
import { SimpleCatalogDialog } from '../pages/SimpleCatalogDialog.ts';
import { SimpleDnsSettings } from '../pages/SimpleDnsSettings.ts';
import { SimpleRoutesPage } from '../pages/SimpleRoutesPage.ts';
import { SimpleRuleControls } from '../pages/SimpleRuleControls.ts';

export const test = base.extend<{
  applyBar: ApplyBar;
  configPage: ConfigPage;
  connectionsPage: ConnectionsPage;
  overviewPage: OverviewPage;
  proxiesPage: ProxiesPage;
  sectionPage: SectionPage;
  settingsPage: SettingsPage;
  simpleCatalog: SimpleCatalogDialog;
  simpleDns: SimpleDnsSettings;
  simpleRuleControls: SimpleRuleControls;
  simpleRoutesPage: SimpleRoutesPage;
}>({
  applyBar: async ({ page }, use) => {
    await use(new ApplyBar(page));
  },
  configPage: async ({ page }, use) => {
    await use(new ConfigPage(page));
  },
  connectionsPage: async ({ page }, use) => {
    await use(new ConnectionsPage(page));
  },
  overviewPage: async ({ page }, use) => {
    await use(new OverviewPage(page));
  },
  proxiesPage: async ({ page }, use) => {
    await use(new ProxiesPage(page));
  },
  sectionPage: async ({ page }, use) => {
    await use(new SectionPage(page));
  },
  settingsPage: async ({ page }, use) => {
    await use(new SettingsPage(page));
  },
  simpleDns: async ({ page, simpleRoutesPage }, use) => {
    await use(new SimpleDnsSettings(page, simpleRoutesPage));
  },
  simpleCatalog: async ({ page }, use) => {
    await use(new SimpleCatalogDialog(page));
  },
  simpleRuleControls: async ({ page, simpleRoutesPage }, use) => {
    await use(new SimpleRuleControls(page, simpleRoutesPage));
  },
  simpleRoutesPage: async ({ page }, use) => {
    await use(new SimpleRoutesPage(page));
  },
});
