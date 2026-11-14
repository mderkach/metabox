import type { Locator, Page } from '@playwright/test';

import { translate } from '../lib/i18n.ts';

const PASSWORD = 'features/Auth/AuthPassword';
const SESSIONS = 'features/Auth/AuthSessions';

/** The settings screen: the panel password and the list of panel sessions under it. */
export class SettingsPage {
  readonly page: Page;
  readonly sessions: Locator;

  constructor(page: Page) {
    this.page = page;
    this.sessions = page.getByRole('list', { name: translate(SESSIONS, 'title') });
  }

  async goto() {
    await this.page.goto('/settings');
  }

  async setFirstPassword(password: string) {
    await this.page.getByLabel(translate(PASSWORD, 'field.password'), { exact: true }).fill(password);
    await this.page.getByLabel(translate(PASSWORD, 'field.confirm'), { exact: true }).fill(password);
    await this.page.getByRole('button', { name: translate(PASSWORD, 'save') }).click();
  }

  session(addr: string): Locator {
    return this.sessions.getByRole('listitem').filter({ hasText: addr });
  }

  endButton(addr: string): Locator {
    return this.sessions.getByRole('button', { name: translate(SESSIONS, 'endNamed', { name: addr }) });
  }
}
