import type { Locator, Page } from '@playwright/test';

import { CONFIG_APPLY_NS } from '../../src/features/Config/ConfigApply/i18n/ConfigApply.namespace.generated.ts';
import { CONFIG_NODE_ADD_NS } from '../../src/features/Config/ConfigNodeAdd/i18n/ConfigNodeAdd.namespace.generated.ts';
import { SECTION_NS } from '../../src/pages/Section/i18n/Section.namespace.generated.ts';
import { SIMPLE_ROUTES_NS } from '../../src/pages/SimpleRoutes/i18n/SimpleRoutes.namespace.generated.ts';
import { SHARED_NS } from '../../src/shared/i18n/Shared.namespace.generated.ts';
import { APP_SIDEBAR_NS } from '../../src/widgets/AppSidebar/i18n/AppSidebar.namespace.generated.ts';
import { CONFIG_RAW_EDITOR_NS } from '../../src/widgets/Config/ConfigRawEditor/i18n/ConfigRawEditor.namespace.generated.ts';
import { CONFIG_SECTION_SETTINGS_NS } from '../../src/widgets/Config/ConfigSectionSettings/i18n/ConfigSectionSettings.namespace.generated.ts';
import { CONFIG_TABS_NS } from '../../src/widgets/Config/ConfigTabs/i18n/ConfigTabs.namespace.generated.ts';
import { translate } from '../lib/i18n.ts';

function subscriptionText(key: string): string {
  return translate(CONFIG_NODE_ADD_NS, `subscription.${key}`);
}

const SECTIONS = ['interception', 'dns', 'outbounds', 'rules'] as const;
export const SIMPLE_SECTION_HEADINGS = SECTIONS.map((section) => translate(SIMPLE_ROUTES_NS, `sections.${section}`));

/** The Simple Routes sections, the shared add dialog and navigation between the three views. */
export class SimpleRoutesPage {
  readonly page: Page;
  readonly sectionHeadings: Locator;
  readonly configNav: Locator;
  readonly interception: Locator;
  readonly dns: Locator;
  readonly outbounds: Locator;
  readonly rules: Locator;
  readonly header: Locator;
  readonly title: Locator;
  readonly views: Locator;
  readonly configPath: Locator;
  readonly routingMode: Locator;
  readonly routingSettings: Locator;
  readonly addFromHeader: Locator;
  readonly addFromOutbounds: Locator;
  readonly addFromStarter: Locator;
  readonly starter: Locator;
  readonly dialog: Locator;
  readonly serverLink: Locator;
  readonly addServer: Locator;
  readonly cancel: Locator;
  readonly subscription: Locator;
  readonly addSubscription: Locator;
  readonly subscriptionNotice: Locator;
  readonly subscriptionTag: Locator;
  readonly subscriptionTagError: Locator;
  readonly subscriptionGroup: Locator;
  readonly subscriptionCustomInterval: Locator;
  readonly subscriptionIntervalValue: Locator;
  readonly subscriptionIntervalUnit: Locator;
  readonly subscriptionAgent: Locator;
  readonly subscriptionAgentHelp: Locator;
  readonly subscriptionAgentHelpButton: Locator;
  readonly subscriptionAgentValue: Locator;
  readonly stageSubscription: Locator;
  readonly simpleView: Locator;
  readonly editorView: Locator;
  readonly jsonView: Locator;
  readonly editorOutbounds: Locator;
  readonly configText: Locator;
  readonly openRouteHelp: Locator;
  readonly routeExamples: Locator;
  readonly dnsHelpButton: Locator;
  readonly dnsHelp: Locator;
  readonly openHistory: Locator;
  readonly closeHistory: Locator;
  readonly history: Locator;

  constructor(page: Page) {
    this.page = page;
    this.configNav = page.getByRole('navigation', { name: translate(APP_SIDEBAR_NS, 'nav.label') }).getByRole('link', {
      name: translate(SHARED_NS, 'section.config'),
      exact: true,
    });
    this.sectionHeadings = page.getByRole('heading', {
      name: new RegExp(`^(${SIMPLE_SECTION_HEADINGS.join('|')})$`),
    });
    this.interception = page.getByRole('region', {
      name: translate(SIMPLE_ROUTES_NS, 'sections.interception'),
      exact: true,
    });
    this.dns = page.getByRole('region', { name: translate(SIMPLE_ROUTES_NS, 'sections.dns'), exact: true });
    this.outbounds = page.getByRole('region', { name: translate(SIMPLE_ROUTES_NS, 'sections.outbounds'), exact: true });
    this.rules = page.getByRole('region', { name: translate(SIMPLE_ROUTES_NS, 'sections.rules'), exact: true });
    this.starter = page.getByRole('region', { name: translate(SIMPLE_ROUTES_NS, 'starter.title'), exact: true });

    const addAction = translate(SIMPLE_ROUTES_NS, 'addServer.action');
    this.title = page.getByRole('heading', { name: translate(SHARED_NS, 'section.config'), level: 1 });
    this.header = page.locator('header').filter({ has: this.title });
    this.configPath = this.header.getByText('/etc/sing-box/config.json', { exact: true });
    this.routingMode = this.header.getByRole('combobox', {
      name: new RegExp(translate(SHARED_NS, 'clashMode.routing')),
    });
    this.routingSettings = page.getByRole('button', {
      name: translate(CONFIG_SECTION_SETTINGS_NS, 'title.route'),
      exact: true,
    });
    this.addFromHeader = this.header.getByRole('button', { name: addAction, exact: true });
    this.addFromOutbounds = this.outbounds.getByRole('button', { name: addAction, exact: true });
    this.addFromStarter = this.starter.getByRole('button', { name: addAction, exact: true });

    this.dialog = page.getByRole('dialog', { name: translate(SIMPLE_ROUTES_NS, 'addServer.title'), exact: true });
    this.serverLink = this.dialog.getByLabel(translate(CONFIG_NODE_ADD_NS, 'field.link.label'), { exact: true });
    this.addServer = this.dialog.getByRole('button', {
      name: translate(CONFIG_NODE_ADD_NS, 'subscription.stage'),
      exact: true,
    });
    this.cancel = this.dialog.getByRole('button', {
      name: translate(SIMPLE_ROUTES_NS, 'addServer.cancel'),
      exact: true,
    });
    this.subscription = this.dialog.getByRole('link', {
      name: translate(SIMPLE_ROUTES_NS, 'addServer.subscription'),
      exact: true,
    });
    this.addSubscription = page.getByRole('button', { name: translate(SECTION_NS, 'add.open'), exact: true });

    this.subscriptionNotice = this.dialog.getByText(subscriptionText('notice'), { exact: true });
    this.subscriptionTag = this.dialog.getByRole('textbox', { name: subscriptionText('tag'), exact: true });
    this.subscriptionTagError = this.dialog.getByText(subscriptionText('tagTaken'));
    this.subscriptionGroup = this.dialog.getByRole('combobox', { name: subscriptionText('group'), exact: true });
    this.subscriptionCustomInterval = this.dialog.getByRole('radio', {
      name: subscriptionText('customInterval'),
      exact: true,
    });
    this.subscriptionIntervalValue = this.dialog.getByRole('spinbutton', {
      name: subscriptionText('intervalValue'),
      exact: true,
    });
    this.subscriptionIntervalUnit = this.dialog.getByRole('combobox', {
      name: subscriptionText('intervalUnit'),
      exact: true,
    });
    this.subscriptionAgent = this.dialog.getByRole('combobox', { name: subscriptionText('agent'), exact: true });
    this.subscriptionAgentHelpButton = this.dialog.getByRole('button', {
      name: subscriptionText('agentHelpLabel'),
      exact: true,
    });
    this.subscriptionAgentHelp = page.getByText(subscriptionText('agentHelp'), { exact: true });
    this.subscriptionAgentValue = this.dialog.getByRole('textbox', {
      name: subscriptionText('agentValue'),
      exact: true,
    });
    this.stageSubscription = this.dialog.getByRole('button', { name: subscriptionText('stage'), exact: true });

    this.views = this.header.getByRole('tablist', { name: translate(CONFIG_TABS_NS, 'views.label'), exact: true });
    this.simpleView = this.views.getByRole('tab', { name: translate(CONFIG_TABS_NS, 'views.simple'), exact: true });
    this.editorView = this.views.getByRole('tab', { name: translate(CONFIG_TABS_NS, 'views.editor'), exact: true });
    this.jsonView = this.views.getByRole('tab', { name: translate(CONFIG_TABS_NS, 'views.json'), exact: true });
    this.editorOutbounds = page.getByRole('tab', {
      name: new RegExp(`^${translate(CONFIG_TABS_NS, 'section.outbounds')}`),
    });
    this.configText = page.getByRole('textbox', {
      name: translate(CONFIG_RAW_EDITOR_NS, 'editor.label'),
      exact: true,
    });
    this.openRouteHelp = page.getByText(translate(SIMPLE_ROUTES_NS, 'help.title'), { exact: true });
    this.routeExamples = page.getByRole('link', { name: translate(SIMPLE_ROUTES_NS, 'help.examples'), exact: true });
    const dnsHelpLabel = translate(SIMPLE_ROUTES_NS, 'help.label', {
      section: translate(SIMPLE_ROUTES_NS, 'sections.dns'),
    });
    this.dnsHelpButton = this.dns.getByRole('button', { name: dnsHelpLabel });
    this.dnsHelp = page.getByRole('dialog', { name: dnsHelpLabel });
    this.openHistory = page.getByRole('button', { name: translate(CONFIG_APPLY_NS, 'history.open'), exact: true });
    this.history = page.getByRole('dialog', { name: translate(CONFIG_APPLY_NS, 'history.title'), exact: true });
    this.closeHistory = this.history.getByLabel(translate(SHARED_NS, 'action.close'), { exact: true });
  }

  outboundTile(tag: string) {
    return this.outbounds.getByRole('button').filter({ has: this.page.getByText(tag, { exact: true }) });
  }

  async goto(outbound: string) {
    await this.page.goto(`/config/simple?outbound=${encodeURIComponent(outbound)}`);
  }

  async mockConfig(config: Record<string, unknown> | string, coreVersion?: string) {
    // The dev stand starts its worker before the panel, so the first config request already sees this handler.
    await this.page.route(
      (url) => url.pathname === '/mocks/browser.ts',
      async (route) => {
        const response = await route.fetch();
        const json = typeof config === 'string' ? config : JSON.stringify(config);
        const handler = `worker.use(http.get("/api/config", () => HttpResponse.text(${JSON.stringify(json)})));`;
        const status =
          coreVersion === undefined
            ? ''
            : `
          import { DAEMON_STATUS_FIXTURE, SERVICE_RUNNING_FIXTURE } from '/src/entities/Daemon/__tests__/Daemon.fixture.ts';
          worker.use(http.get('/api/service', () => HttpResponse.json({
            ...SERVICE_RUNNING_FIXTURE, binary: ${JSON.stringify(coreVersion)}
          })));
          worker.use(http.get('/api/status', () => HttpResponse.json({
            ...DAEMON_STATUS_FIXTURE,
            core: { ...DAEMON_STATUS_FIXTURE.core, version: ${JSON.stringify(coreVersion)} },
            singbox_version: ${JSON.stringify(coreVersion)}
          })));
        `;
        await route.fulfill({ response, body: `${await response.text()}\n${handler}\n${status}` });
      }
    );
  }

  async openWithConfig(config: Record<string, unknown> | string, coreVersion?: string) {
    await this.mockConfig(config, coreVersion);
    await this.page.goto('/overview');
    await this.configNav.click();
  }

  private async selectSubscriptionOption(select: Locator, label: string) {
    await select.click();
    await this.page.getByRole('option', { name: label, exact: true }).click();
  }

  async selectSubscriptionGroup(tag: string) {
    await this.selectSubscriptionOption(this.subscriptionGroup, tag);
  }

  async setSubscriptionInterval(amount: number, unit: 'hours' | 'days') {
    await this.subscriptionCustomInterval.check();
    await this.subscriptionIntervalValue.fill(String(amount));
    await this.selectSubscriptionOption(this.subscriptionIntervalUnit, subscriptionText(unit));
  }

  async selectSubscriptionAgent(profile: 'chrome' | 'customAgent') {
    await this.selectSubscriptionOption(this.subscriptionAgent, subscriptionText(profile));
  }

  async stageServer(link: string) {
    await this.serverLink.fill(link);
    await this.addServer.press('Enter');
  }
}
