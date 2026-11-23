import type { Locator, Page } from '@playwright/test';

import { translate } from '../lib/i18n.ts';

const SIMPLE_ROUTES = 'pages/SimpleRoutes';
const CONFIG_TABS = 'widgets/Config/ConfigTabs';
const NODE_ADD = 'features/Config/ConfigNodeAdd';
const CONFIG_APPLY = 'features/Config/ConfigApply';

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
  readonly addFromOutbounds: Locator;
  readonly addFromStarter: Locator;
  readonly starter: Locator;
  readonly dialog: Locator;
  readonly serverLink: Locator;
  readonly addServer: Locator;
  readonly cancel: Locator;
  readonly subscription: Locator;
  readonly addSubscription: Locator;
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
    this.addFromOutbounds = this.outbounds.getByRole('button', { name: addAction, exact: true });
    this.addFromStarter = this.starter.getByRole('button', { name: addAction, exact: true });

    this.dialog = page.getByRole('dialog', { name: translate(SIMPLE_ROUTES, 'addServer.title'), exact: true });
    this.serverLink = this.dialog.getByRole('textbox', { name: translate(NODE_ADD, 'field.link.label') });
    this.addServer = this.dialog.getByRole('button', { name: translate(NODE_ADD, 'submitLink'), exact: true });
    this.cancel = this.dialog.getByRole('button', { name: translate(SIMPLE_ROUTES, 'addServer.cancel'), exact: true });
    this.subscription = this.dialog.getByRole('link', {
      name: translate(SIMPLE_ROUTES, 'addServer.subscription'),
      exact: true,
    });
    this.addSubscription = page.getByRole('button', { name: translate('pages/Section', 'add.open'), exact: true });

    const views = page.getByRole('tablist', { name: translate(CONFIG_TABS, 'views.label'), exact: true });
    this.simpleView = views.getByRole('tab', { name: translate(CONFIG_TABS, 'views.simple'), exact: true });
    this.editorView = views.getByRole('tab', { name: translate(CONFIG_TABS, 'views.editor'), exact: true });
    this.jsonView = views.getByRole('tab', { name: translate(CONFIG_TABS, 'views.json'), exact: true });
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

  async goto(outbound: string) {
    await this.page.goto(`/config/simple?outbound=${encodeURIComponent(outbound)}`);
  }

  async openEmpty() {
    // The dev stand starts its worker before the panel, so the first config request already sees this handler.
    await this.page.route(
      (url) => url.pathname === '/mocks/browser.ts',
      async (route) => {
        const response = await route.fetch();
        const handler = 'worker.use(http.get("/api/config", () => HttpResponse.text("{}")));';
        await route.fulfill({ response, body: `${await response.text()}\n${handler}` });
      }
    );
    await this.page.goto('/overview');
    await this.configNav.click();
  }

  async stageServer(link: string) {
    await this.serverLink.fill(link);
    await this.addServer.press('Enter');
  }
}
