import type { Locator, Page } from '@playwright/test';

import { translate } from '../lib/i18n.ts';

const SIMPLE_ROUTES = 'pages/SimpleRoutes';
const CONFIG_TABS = 'widgets/Config/ConfigTabs';
const NODE_ADD = 'features/Config/ConfigNodeAdd';
const CONFIG_APPLY = 'features/Config/ConfigApply';

function subscriptionText(key: string): string {
  return translate(NODE_ADD, `subscription.${key}`);
}

const SECTIONS = ['interception', 'dns', 'outbounds', 'rules'] as const;
export const SIMPLE_SECTION_HEADINGS = SECTIONS.map((section) => translate(SIMPLE_ROUTES, `sections.${section}`));

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
  readonly openHistory: Locator;
  readonly history: Locator;

  constructor(page: Page) {
    this.page = page;
    this.configNav = page
      .getByRole('navigation', { name: translate('widgets/AppSidebar', 'nav.label') })
      .getByRole('link', {
        name: translate('shared', 'section.config'),
        exact: true,
      });
    this.sectionHeadings = page.getByRole('heading', {
      name: new RegExp(`^(${SIMPLE_SECTION_HEADINGS.join('|')})$`),
    });
    this.interception = page.getByRole('region', {
      name: translate(SIMPLE_ROUTES, 'sections.interception'),
      exact: true,
    });
    this.dns = page.getByRole('region', { name: translate(SIMPLE_ROUTES, 'sections.dns'), exact: true });
    this.outbounds = page.getByRole('region', { name: translate(SIMPLE_ROUTES, 'sections.outbounds'), exact: true });
    this.rules = page.getByRole('region', { name: translate(SIMPLE_ROUTES, 'sections.rules'), exact: true });
    this.starter = page.getByRole('region', { name: translate(SIMPLE_ROUTES, 'starter.title'), exact: true });

    const addAction = translate(SIMPLE_ROUTES, 'addServer.action');
    this.title = page.getByRole('heading', { name: translate('shared', 'section.config'), level: 1 });
    this.header = page.locator('header').filter({ has: this.title });
    this.configPath = this.header.getByText('/etc/sing-box/config.json', { exact: true });
    this.addFromHeader = this.header.getByRole('button', { name: addAction, exact: true });
    this.addFromOutbounds = this.outbounds.getByRole('button', { name: addAction, exact: true });
    this.addFromStarter = this.starter.getByRole('button', { name: addAction, exact: true });

    this.dialog = page.getByRole('dialog', { name: translate(SIMPLE_ROUTES, 'addServer.title'), exact: true });
    this.serverLink = this.dialog.getByLabel(translate(NODE_ADD, 'field.link.label'), { exact: true });
    this.addServer = this.dialog.getByRole('button', { name: translate(NODE_ADD, 'subscription.stage'), exact: true });
    this.cancel = this.dialog.getByRole('button', { name: translate(SIMPLE_ROUTES, 'addServer.cancel'), exact: true });
    this.subscription = this.dialog.getByRole('link', {
      name: translate(SIMPLE_ROUTES, 'addServer.subscription'),
      exact: true,
    });
    this.addSubscription = page.getByRole('button', { name: translate('pages/Section', 'add.open'), exact: true });

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

    this.views = this.header.getByRole('tablist', { name: translate(CONFIG_TABS, 'views.label'), exact: true });
    this.simpleView = this.views.getByRole('tab', { name: translate(CONFIG_TABS, 'views.simple'), exact: true });
    this.editorView = this.views.getByRole('tab', { name: translate(CONFIG_TABS, 'views.editor'), exact: true });
    this.jsonView = this.views.getByRole('tab', { name: translate(CONFIG_TABS, 'views.json'), exact: true });
    this.editorOutbounds = page.getByRole('tab', {
      name: new RegExp(`^${translate(CONFIG_TABS, 'section.outbounds')}`),
    });
    this.configText = page.getByRole('textbox', {
      name: translate('widgets/Config/ConfigRawEditor', 'editor.label'),
      exact: true,
    });
    this.openHistory = page.getByRole('button', { name: translate(CONFIG_APPLY, 'history.open'), exact: true });
    this.history = page.getByRole('dialog', { name: translate(CONFIG_APPLY, 'history.title'), exact: true });
  }

  async openV11Preview(empty = false) {
    await this.page.goto(`/config/simple?mock=${empty ? 'routes-v11-empty' : 'routes-v11'}`);
  }

  async goto(outbound: string) {
    await this.page.goto(`/config/simple?outbound=${encodeURIComponent(outbound)}`);
  }

  async openWithConfig(config: Record<string, unknown>) {
    // The dev stand starts its worker before the panel, so the first config request already sees this handler.
    await this.page.route(
      (url) => url.pathname === '/mocks/browser.ts',
      async (route) => {
        const response = await route.fetch();
        const json = JSON.stringify(config);
        const handler = `worker.use(http.get("/api/config", () => HttpResponse.text(${JSON.stringify(json)})));`;
        await route.fulfill({ response, body: `${await response.text()}\n${handler}` });
      }
    );
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
