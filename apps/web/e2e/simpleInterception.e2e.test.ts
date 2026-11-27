import type { Request } from '@playwright/test';

import { DEVICE_ROUTE_NS } from '../src/features/Device/DeviceRoute/i18n/DeviceRoute.namespace.generated.ts';
import { E2E_TAG, expect, test, translate } from './fixtures/index.ts';

const CONFIG = {
  inbounds: [{ type: 'mixed', tag: 'apps', listen: '127.0.0.1', listen_port: 1080 }],
  dns: { servers: [{ type: 'tcp', tag: 'local', server: '192.0.2.53' }] },
  outbounds: [{ type: 'direct', tag: 'direct' }],
  route: { final: 'direct' },
};
const INDENT = 2;
const DRAFT = JSON.stringify(
  { ...CONFIG, inbounds: CONFIG.inbounds.map((inbound) => ({ ...inbound, listen_port: 2080 })) },
  null,
  INDENT
);
const ADDRESS = '127.0.0.1:1080';

test(
  'Simple previews interception without writing and keeps the shared JSON draft through confirmation',
  { tag: E2E_TAG.Mock },
  async ({ page, simpleRoutesPage: routes, interception, applyBar }) => {
    const writes: Request[] = [];
    page.on('request', (request) => {
      if (request.method() === 'PUT' && new URL(request.url()).pathname === '/api/dataplane') writes.push(request);
    });
    await routes.openWithConfig(CONFIG);
    await routes.jsonView.click();
    await routes.configText.fill(DRAFT);
    await expect(applyBar.dirty).toBeVisible();
    await routes.simpleView.click();
    await interception.settings.press('Enter');

    await test.step('inspect the saved proxy and review a device selection by keyboard', async () => {
      await interception.proxy.press('Enter');
      await expect(routes.interception.getByText(ADDRESS, { exact: true })).toBeVisible();
      await interception.proxy.press('Space');
      await expect(routes.interception.getByText(ADDRESS, { exact: true })).toBeHidden();
      await expect(interception.proxy).toBeFocused();
      await expect(interception.review).toBeDisabled();
      await interception.picker.press('Enter');
      const laptop = interception.device('laptop');
      await laptop.press('Space');
      await expect(laptop).toBeChecked();
      await interception.review.press('Enter');
      await expect(interception.preview).toContainText('aa:bb:cc:00:01:21');
      await expect(interception.preview).toContainText('192.168.1.180');
      await interception.start.press('Escape');
      await expect(interception.review).toBeFocused();
      await expect(laptop).toBeChecked();
      await interception.reset.click();
      await expect(laptop).not.toBeChecked();
      await expect(interception.review).toBeDisabled();
      expect(writes).toHaveLength(0);
    });

    await test.step('choose all explicitly, start its transaction and confirm it', async () => {
      await interception.all.check();
      await interception.review.press('Enter');
      await expect(interception.preview).toContainText(translate(DEVICE_ROUTE_NS, 'scope.allValue'));
      await expect(interception.preview).toContainText('AA:BB:CC:00:01:04');
      expect(writes).toHaveLength(0);
      await interception.start.press('Enter');
      await expect(interception.keep).toBeVisible();
      expect(writes).toHaveLength(1);
      expect(writes[0]?.headers()['if-match']).toBe('"dataplane-1"');
      const submitted: unknown = writes[0]?.postDataJSON();
      expect(submitted).toMatchObject({
        model: { acl_mode: 'all', source_ip: ['192.168.1.180'], source_mac: ['AA:BB:CC:00:01:04'], dns_hijack: true },
      });
      await expect(interception.review).toBeDisabled();
      await expect(interception.progress).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(interception.keep).toBeFocused();
      await interception.keep.press('Enter');
      await expect(interception.keep).toBeHidden();
      await expect(interception.all).toBeChecked();
      await expect(interception.current).toBeFocused();
      await routes.jsonView.click();
      await expect(routes.configText).toHaveValue(DRAFT);
      await expect(applyBar.dirty).toBeVisible();
    });
  }
);
