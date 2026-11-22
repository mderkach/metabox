import { E2E_TAG, expect, test, translate } from './fixtures/index.ts';

const ADD = 'features/Config/ConfigNodeAdd';
const FORM = 'features/Config/ConfigNodeForm';
const PROXIES = 'pages/Proxies';
const TAG = 'reality-check';
const UUID = '01234567-89ab-4cde-8123-456789abcdef';
const PHONE_VIEWPORT = { width: 375, height: 812 };
const LONG_NAME_REPETITIONS = 18;
const OMITTED = 'unmapped-' + 'parameter'.repeat(LONG_NAME_REPETITIONS);
const PUBLIC_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const REALITY_OUTBOUND = {
  type: 'vless',
  tag: TAG,
  server: 'proxy.example',
  server_port: 443,
  uuid: UUID,
  tls: {
    enabled: true,
    server_name: 'example.com',
    utls: { enabled: true, fingerprint: 'chrome' },
    reality: { enabled: true, public_key: PUBLIC_KEY },
  },
};

test(
  'announces omitted link parameters before adding a REALITY server',
  { tag: E2E_TAG.Mock },
  async ({ page, sectionPage, applyBar }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    await sectionPage.goto('outbounds');
    await page.getByRole('button', { name: translate('pages/Section', 'add.open') }).click();

    const field = page.getByRole('textbox', { name: translate(ADD, 'field.link.label') });
    const base = `vless://${UUID}@proxy.example:443?security=reality&sni=example.com&pbk=${PUBLIC_KEY}`;
    await field.fill(`${base}&${OMITTED}=hidden&spx=%2Fsecret#${TAG}`);
    const warning = page.getByRole('status').filter({ hasText: OMITTED });
    await expect(warning).toContainText('spx');
    await expect(warning).not.toContainText('hidden');
    await expect(warning).not.toContainText('/secret');

    await field.fill(`${base}&support-x25519mlkem768=true#${TAG}`);
    await expect(warning).toBeHidden();
    await field.press('Tab');
    const add = page.getByRole('button', { name: translate(ADD, 'submitLink') });
    await expect(add).toBeFocused();
    await add.press('Enter');

    await expect(page.getByRole('switch', { name: translate(FORM, 'label.realityHybridKeyShare') })).toBeChecked();
    await sectionPage.closePanel.click();
    await expect(applyBar.dirty).toBeVisible();
  }
);

test(
  'opens the existing REALITY node from a failed manual latency check',
  { tag: E2E_TAG.Mock },
  async ({ page, applyBar }) => {
    await page.goto('/logs');
    await page.evaluate(async (outbound) => {
      const mockPath = '/mocks/browser.ts';
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Vite exposes the mock worker by URL in the browser.
      const { worker, http, HttpResponse } = (await import(mockPath)) as {
        worker: Pick<import('msw/browser').SetupWorker, 'use'>;
        http: typeof import('msw').http;
        HttpResponse: typeof import('msw').HttpResponse;
      };
      worker.use(
        http.get('/api/config', () =>
          HttpResponse.text(JSON.stringify({ outbounds: [outbound] }), { headers: { etag: '"applied-config"' } })
        ),
        http.get('/api/clash/proxies', () =>
          HttpResponse.json({
            proxies: { [outbound.tag]: { name: outbound.tag, type: 'VLESS', udp: true, history: [] } },
          })
        ),
        http.get(`/api/clash/proxies/${outbound.tag}/delay`, () =>
          HttpResponse.json({ message: 'An error occurred in the delay test' }, { status: 503 })
        )
      );
    }, REALITY_OUTBOUND);
    await page.getByRole('link', { name: translate('shared', 'section.proxies') }).click();

    const check = page.getByRole('button', { name: translate('widgets/ProxyGroups', 'empty.testOutbounds') });
    await check.focus();
    await check.press('Enter');
    const edit = page.getByRole('link', { name: translate(PROXIES, 'recovery.edit', { tag: TAG }) });
    await expect(edit).toBeVisible();

    await expect(applyBar.dirty).toBeHidden();
    await edit.focus();
    await edit.press('Enter');
    const option = page.getByRole('switch', { name: translate(FORM, 'label.realityHybridKeyShare') });
    await expect(option).not.toBeChecked();
    await option.focus();
    await option.press('Space');
    await expect(option).toBeChecked();
    await expect(applyBar.dirty).toBeVisible();
  }
);
