import { E2E_TAG, expect, test, translate } from './fixtures/index.ts';

const SESSIONS = 'features/Auth/AuthSessions';
// The mock stand signs in a phone from this address besides the panel's own browser.
const PHONE = '192.168.1.23';

test('ends another panel session from the settings screen', { tag: E2E_TAG.Mock }, async ({ settingsPage }) => {
  await settingsPage.goto();

  await test.step('setting a password lists this browser and the other sessions', async () => {
    await settingsPage.setFirstPassword('correct horse');

    await expect(settingsPage.sessions.getByText(translate(SESSIONS, 'current'))).toBeVisible();
    await expect(settingsPage.session(PHONE)).toBeVisible();
  });

  await test.step('ending the phone session removes it from the list', async () => {
    await settingsPage.endButton(PHONE).click();

    await expect(settingsPage.session(PHONE)).toBeHidden();
    await expect(settingsPage.sessions).toBeFocused();
  });
});
