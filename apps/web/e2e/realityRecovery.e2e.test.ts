import { CONFIG_NODE_ADD_NS } from '../src/features/Config/ConfigNodeAdd/i18n/ConfigNodeAdd.namespace.generated.ts';
import { CONFIG_NODE_FORM_NS } from '../src/features/Config/ConfigNodeForm/i18n/ConfigNodeForm.namespace.generated.ts';
import { PROXY_REALITY_RECOVERY_NS } from '../src/features/Proxy/ProxyRealityRecovery/i18n/ProxyRealityRecovery.namespace.generated.ts';
import { SECTION_NS } from '../src/pages/Section/i18n/Section.namespace.generated.ts';
import { SHARED_NS } from '../src/shared/i18n/Shared.namespace.generated.ts';
import { PROXY_GROUPS_NS } from '../src/widgets/ProxyGroups/i18n/ProxyGroups.namespace.generated.ts';
import { E2E_TAG, expect, test, translate } from './fixtures/index.ts';

const TAG = 'reality-check';
const UUID = '01234567-89ab-4cde-8123-456789abcdef';
const PHONE_VIEWPORT = { width: 375, height: 812 };
const LONG_NAME_REPETITIONS = 18;
const OMITTED = 'unmapped-' + 'parameter'.repeat(LONG_NAME_REPETITIONS);
const SHA256_LENGTH = 64;
const SHA256_RADIX = 16;
const PROBE_ERROR_CHECK = 2;
const MAX_DIAGNOSTIC_GAP = 12;
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
    await page.getByRole('button', { name: translate(SECTION_NS, 'add.open') }).click();

    const field = page.getByRole('textbox', { name: translate(CONFIG_NODE_ADD_NS, 'field.link.label') });
    const base = `vless://${UUID}@proxy.example:443?security=reality&sni=example.com&pbk=${PUBLIC_KEY}`;
    await field.fill(`${base}&${OMITTED}=hidden&spx=%2Fsecret#${TAG}`);
    const warning = page.getByRole('status').filter({ hasText: OMITTED });
    await expect(warning).toContainText('spx');
    await expect(warning).not.toContainText('hidden');
    await expect(warning).not.toContainText('/secret');

    await field.fill(`${base}&support-x25519mlkem768=true#${TAG}`);
    await expect(warning).toBeHidden();
    await field.press('Tab');
    const add = page.getByRole('button', { name: translate(CONFIG_NODE_ADD_NS, 'submitLink') });
    await expect(add).toBeFocused();
    await add.press('Enter');

    await expect(
      page.getByRole('switch', { name: translate(CONFIG_NODE_FORM_NS, 'label.realityHybridKeyShare') })
    ).toBeChecked();
    await sectionPage.closePanel.click();
    await expect(applyBar.dirty).toBeVisible();
  }
);

test(
  'applies and restores a REALITY setting after distinct retest failures',
  { tag: E2E_TAG.Mock },
  async ({ page, applyBar }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    await page.goto('/logs');
    const proxiesLink = page.getByRole('link', { name: translate(SHARED_NS, 'section.proxies') });
    await proxiesLink.waitFor();
    await page.evaluate(
      async ({ outbound, radix, hashLength, probeErrorCheck }) => {
        const mockPath = '/mocks/browser.ts';
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Vite exposes the mock worker by URL in the browser.
        const { worker, http, HttpResponse } = (await import(mockPath)) as {
          worker: Pick<import('msw/browser').SetupWorker, 'use'>;
          http: typeof import('msw').http;
          HttpResponse: typeof import('msw').HttpResponse;
        };
        const initialStatus: unknown = await fetch('/api/status').then(async (response) => response.json());

        if (typeof initialStatus !== 'object' || initialStatus === null) {
          throw new Error('Missing mock daemon status');
        }

        let active = JSON.stringify({ outbounds: [outbound] });
        let submitted = active;
        let revision = 0;
        let checks = 0;
        let transaction: {
          id: string;
          phase: 'awaiting_confirm' | 'confirmed';
          window: number;
          sha256: string;
        } | null = null;
        const hash = (version: number) => version.toString(radix).padStart(hashLength, '0');

        worker.use(
          http.get('/api/config', () => HttpResponse.text(active, { headers: { etag: `"${hash(revision)}"` } })),
          http.get('/api/status', () =>
            HttpResponse.json({
              ...initialStatus,
              ...(transaction === null
                ? {}
                : {
                    transaction,
                    transaction_href: `/api/apply/${transaction.id}`,
                  }),
            })
          ),
          http.post('/api/apply', async ({ request }) => {
            submitted = await request.text();
            transaction = {
              id: `reality-${revision + 1}`,
              phase: 'awaiting_confirm',
              window: 60_000_000_000,
              sha256: hash(revision + 1),
            };

            return HttpResponse.json(transaction, { status: 202 });
          }),
          http.get('/api/apply/:id', () => HttpResponse.json(transaction)),
          http.post('/api/apply/:id/confirm', () => {
            if (transaction === null) return HttpResponse.json({ code: 'nothing_to_confirm' }, { status: 409 });
            active = submitted;
            revision += 1;
            transaction = { ...transaction, phase: 'confirmed', window: 0 };

            return HttpResponse.json(transaction);
          }),
          http.get('/api/clash/proxies', () =>
            HttpResponse.json({
              proxies: { [outbound.tag]: { name: outbound.tag, type: 'VLESS', udp: true, history: [] } },
            })
          ),
          http.get(`/api/clash/proxies/${outbound.tag}/delay`, () => {
            checks += 1;

            return checks === probeErrorCheck
              ? HttpResponse.json({ code: 'clash_api_disabled', message: 'Core unavailable' }, { status: 503 })
              : HttpResponse.json({ message: 'An error occurred in the delay test' }, { status: 503 });
          })
        );
      },
      { outbound: REALITY_OUTBOUND, radix: SHA256_RADIX, hashLength: SHA256_LENGTH, probeErrorCheck: PROBE_ERROR_CHECK }
    );
    await proxiesLink.click();

    const check = page.getByRole('button', { name: translate(PROXY_GROUPS_NS, 'empty.testOutbounds') });
    const diagnosis = page.getByRole('button', {
      name: translate(PROXY_REALITY_RECOVERY_NS, 'recovery.open', { tag: TAG }),
    });
    const stage = page.getByRole('button', { name: translate(PROXY_REALITY_RECOVERY_NS, 'recovery.stage') });
    const retry = page.getByRole('button', { name: translate(PROXY_REALITY_RECOVERY_NS, 'recovery.retry') });
    const restore = page.getByRole('button', { name: translate(PROXY_REALITY_RECOVERY_NS, 'recovery.restore') });
    const node = page.getByRole('listitem').filter({
      has: page.getByRole('button', { name: translate(PROXY_GROUPS_NS, 'metadata.editLabel', { tag: TAG }) }),
    });

    await test.step('opens the server diagnosis and puts just the setting in the draft', async () => {
      await expect(node).toBeVisible();
      const before = await node.boundingBox();
      await check.press('Enter');
      await expect(diagnosis).toBeVisible();
      const after = await node.boundingBox();
      expect(after).toMatchObject({ width: before?.width, height: before?.height });
      await expect(diagnosis).toHaveAttribute('aria-expanded', 'false');
      await expect(applyBar.dirty).toBeHidden();
      await diagnosis.press('Enter');
      await stage.click();
      await expect(applyBar.dirty).toBeVisible();

      await applyBar.apply();
      const [submission] = await Promise.all([
        page.waitForRequest(
          (request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/apply'
        ),
        applyBar.confirmDiff(),
      ]);
      expect(submission.postDataJSON()).toEqual({
        outbounds: [
          {
            ...REALITY_OUTBOUND,
            tls: {
              ...REALITY_OUTBOUND.tls,
              reality: {
                ...REALITY_OUTBOUND.tls.reality,
                support_x25519mlkem768: true,
              },
            },
          },
        ],
      });
      await applyBar.keep();
      await expect(page.getByText(translate(PROXY_REALITY_RECOVERY_NS, 'recovery.states.ready'))).toBeVisible();
    });

    await test.step('separates a test failure from a server that did not answer', async () => {
      await retry.click();
      await expect(page.getByText(translate(PROXY_REALITY_RECOVERY_NS, 'recovery.states.probe-error'))).toBeVisible();
      await expect(restore).toBeHidden();

      await retry.click();
      await expect(page.getByText(translate(PROXY_REALITY_RECOVERY_NS, 'recovery.states.no-response'))).toBeVisible();
      await expect(restore).toBeVisible();
      const status = node.getByText(translate(PROXY_REALITY_RECOVERY_NS, 'recovery.noResponse'), { exact: true });
      await expect(status).toBeVisible();
      const statusBox = await status.boundingBox();
      const controlBox = await diagnosis.boundingBox();
      if (statusBox === null || controlBox === null) throw new Error('Expected a visible status and diagnostic button');
      const gap = controlBox.x - (statusBox.x + statusBox.width);
      expect(gap).toBeGreaterThanOrEqual(0);
      expect(gap).toBeLessThanOrEqual(MAX_DIAGNOSTIC_GAP);
    });

    await test.step('restores the absent setting without touching the rest of the config', async () => {
      await restore.click();
      await expect(applyBar.dirty).toBeVisible();
      await applyBar.apply();
      const [submission] = await Promise.all([
        page.waitForRequest(
          (request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/apply'
        ),
        applyBar.confirmDiff(),
      ]);
      expect(submission.postDataJSON()).toEqual({ outbounds: [REALITY_OUTBOUND] });
      const [confirmation] = await Promise.all([
        page.waitForResponse(
          (response) =>
            response.request().method() === 'POST' &&
            new URL(response.url()).pathname === '/api/apply/reality-2/confirm'
        ),
        applyBar.keep(),
      ]);
      expect(await confirmation.json()).toMatchObject({ phase: 'confirmed' });
      await expect(applyBar.region).toBeHidden();
    });
  }
);
