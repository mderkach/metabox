import type { Locator, Page } from '@playwright/test';

import { AUTH_PASSWORD_NS } from '../../src/features/Auth/AuthPassword/i18n/AuthPassword.namespace.generated.ts';
import { AUTH_SESSIONS_NS } from '../../src/features/Auth/AuthSessions/i18n/AuthSessions.namespace.generated.ts';
import { translate } from '../lib/i18n.ts';

/** The settings screen: the panel password and the list of panel sessions under it. */
export class SettingsPage {
  readonly page: Page;
  readonly sessions: Locator;

  constructor(page: Page) {
    this.page = page;
    this.sessions = page.getByRole('list', { name: translate(AUTH_SESSIONS_NS, 'title') });
  }

  async goto() {
    await this.page.goto('/settings');
  }

  async setFirstPassword(password: string) {
    await this.page.getByLabel(translate(AUTH_PASSWORD_NS, 'field.password'), { exact: true }).fill(password);
    await this.page.getByLabel(translate(AUTH_PASSWORD_NS, 'field.confirm'), { exact: true }).fill(password);
    await this.page.getByRole('button', { name: translate(AUTH_PASSWORD_NS, 'save') }).click();
  }

  session(addr: string): Locator {
    return this.sessions.getByRole('listitem').filter({ hasText: addr });
  }

  endButton(addr: string): Locator {
    return this.sessions.getByRole('button', { name: translate(AUTH_SESSIONS_NS, 'endNamed', { name: addr }) });
  }
}
