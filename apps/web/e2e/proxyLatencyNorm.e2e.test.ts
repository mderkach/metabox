import type { Locator, Page } from '@playwright/test';

import { SHARED_NS } from '../src/shared/i18n/Shared.namespace.generated.ts';
import { PROXY_GROUPS_NS } from '../src/widgets/ProxyGroups/i18n/ProxyGroups.namespace.generated.ts';
import { E2E_TAG, expect, test, translate } from './fixtures/index.ts';
import type { ProxiesPage } from './pages/ProxiesPage.ts';

const GROUP = 'test-selector';
const PRIMARY = 'subscription/edge';
const PEER = 'peer';
const UNMEASURED = 'unmeasured';
const PRIMARY_LABEL = 'Harbor';
const PEER_LABEL = 'Backup';
const UNMEASURED_LABEL = 'New server';
const COMPUTED = 180;
const MANUAL_MAX = 10_000;
const PEER_MANUAL = 360;
const UNMEASURED_MANUAL = 470;
const PHONE_WIDTH = 375;
const DESKTOP_WIDTH = 1101;
const PHONE_HEIGHT = 812;
const DESKTOP_HEIGHT = 1080;
const LATENCY_ENDPOINT = '/api/latency';
const METADATA_ENDPOINT = '/api/outbounds';
const AT = '2026-11-22T17:01:00Z';
const PRIMARY_DELAY = 240;
const NO_ANSWER = 65_535;

const VIEWPORTS = [
  { width: 320, height: PHONE_HEIGHT, touch: true },
  { width: PHONE_WIDTH, height: PHONE_HEIGHT, touch: true },
  { width: 901, height: DESKTOP_HEIGHT, touch: false },
  { width: DESKTOP_WIDTH, height: DESKTOP_HEIGHT, touch: false },
  { width: 2213, height: DESKTOP_HEIGHT, touch: false },
  { width: 2711, height: DESKTOP_HEIGHT, touch: false },
];
const THEMES = ['light', 'dark'] as const;

declare const window: {
  holdProxyLatencyRefetch: () => Promise<void>;
  matchMedia: (query: string) => { matches: boolean };
};

async function installProxyMock(
  { page, proxiesPage }: { page: Page; proxiesPage: ProxiesPage },
  heldReset?: typeof PRIMARY | typeof UNMEASURED
) {
  let refetches = 0;
  let releaseRefetch: () => void = () => undefined;
  const refetchGate = new Promise<void>((resolve) => {
    releaseRefetch = resolve;
  });
  await page.exposeFunction('holdProxyLatencyRefetch', async () => {
    refetches += 1;

    return refetchGate;
  });

  const applyRequests: string[] = [];
  const metadataWrites: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path === '/api/apply' || path.startsWith('/api/apply/')) applyRequests.push(path);
    if (request.method() === 'PUT' && path.startsWith(`${METADATA_ENDPOINT}/`)) metadataWrites.push(path);
  });

  await page.goto('/logs');
  const link = page.getByRole('link', { name: translate(SHARED_NS, 'section.proxies'), exact: true });
  await link.waitFor();
  await page.evaluate(
    async ({ at, computed, delay, group, heldReset, max, peer, primary, unmeasured, rawDelay, noAnswer }) => {
      const mockPath = '/mocks/browser.ts';
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Vite exposes the browser mock by URL.
      const { worker, http, HttpResponse } = (await import(mockPath)) as {
        worker: Pick<import('msw/browser').SetupWorker, 'use'>;
        http: typeof import('msw').http;
        HttpResponse: typeof import('msw').HttpResponse;
      };
      const entries = new Map<string, unknown>([
        [primary.tag, { label: primary.label }],
        [peer.tag, { label: peer.label, norm_ms: peer.manual }],
        [unmeasured.tag, { label: unmeasured.label, norm_ms: unmeasured.manual }],
      ]);
      const norms = new Map<string, number>([
        [peer.tag, peer.manual],
        [unmeasured.tag, unmeasured.manual],
      ]);
      if (heldReset === primary.tag) {
        entries.set(primary.tag, { label: primary.label, norm_ms: max });
        norms.set(primary.tag, max);
      }

      let holdRefetch = false;
      const groupMembers = [primary.tag, peer.tag, unmeasured.tag];
      const reading = { at, delay_ms: delay };
      const raw = heldReset === unmeasured.tag ? { at, delay_ms: rawDelay } : undefined;

      worker.use(
        http.get('/api/clash/proxies', () =>
          HttpResponse.json({
            proxies: {
              [group]: { name: group, type: 'Selector', udp: true, history: [], all: groupMembers, now: primary.tag },
              [primary.tag]: { name: primary.tag, type: 'VLESS', udp: true, history: [{ time: at, delay }] },
              [peer.tag]: { name: peer.tag, type: 'VLESS', udp: true, history: [{ time: at, delay: noAnswer }] },
              [unmeasured.tag]: {
                name: unmeasured.tag,
                type: 'VLESS',
                udp: true,
                history: raw === undefined ? [] : [{ time: at, delay: raw.delay_ms }],
              },
            },
          })
        ),
        http.get('/api/outbounds', () => HttpResponse.json(Object.fromEntries(entries))),
        http.put('/api/outbounds/:tag', async ({ request }) => {
          const tag = decodeURIComponent(new URL(request.url).pathname.slice('/api/outbounds/'.length));
          const entry: unknown = await request.json();
          if (typeof entry !== 'object' || entry === null) return HttpResponse.json({}, { status: 400 });

          entries.set(tag, entry);
          if ('norm_ms' in entry && typeof entry.norm_ms === 'number') {
            norms.set(tag, entry.norm_ms);
          } else {
            norms.delete(tag);
            if (tag === heldReset) holdRefetch = true;
          }

          return HttpResponse.json(Object.fromEntries(entries));
        }),
        http.get('/api/latency', async () => {
          if (holdRefetch) await window.holdProxyLatencyRefetch();
          const primaryNorm = norms.get(primary.tag) ?? computed;

          return HttpResponse.json({
            servers: [
              {
                tag: primary.tag,
                computed_usual_ms: computed,
                usual_ms: primaryNorm,
                origin: norms.has(primary.tag) ? 'manual' : 'computed',
                current: reading,
                recent: [reading, reading, reading],
                hourly: [{ hour: at, delay_ms: computed }],
                level: delay > primaryNorm ? 'above_norm' : 'within_norm',
              },
              {
                tag: peer.tag,
                usual_ms: norms.get(peer.tag),
                origin: 'manual',
                current: { at },
                recent: [{ at }],
                hourly: [],
                level: 'no_answer',
              },
              {
                tag: unmeasured.tag,
                usual_ms: norms.get(unmeasured.tag),
                origin: norms.has(unmeasured.tag) ? 'manual' : 'computed',
                current: raw,
                recent: raw === undefined ? [] : [raw],
                hourly: [],
                level: raw === undefined ? 'no_measurement' : 'within_norm',
              },
            ],
          });
        })
      );
    },
    {
      at: AT,
      computed: COMPUTED,
      delay: PRIMARY_DELAY,
      group: GROUP,
      heldReset,
      max: MANUAL_MAX,
      peer: { tag: PEER, label: PEER_LABEL, manual: PEER_MANUAL },
      primary: { tag: PRIMARY, label: PRIMARY_LABEL },
      unmeasured: { tag: UNMEASURED, label: UNMEASURED_LABEL, manual: UNMEASURED_MANUAL },
      rawDelay: PRIMARY_DELAY,
      noAnswer: NO_ANSWER,
    }
  );
  await link.click();
  await expect(proxiesPage.normField(PRIMARY)).toHaveValue(String(heldReset === PRIMARY ? MANUAL_MAX : COMPUTED));

  return { applyRequests, metadataWrites, releaseRefetch, refetches: () => refetches };
}

async function geometry(page: Page, proxies: ProxiesPage, tag: string, action: Locator, width: number) {
  const row = proxies.normRow(tag);
  await page.evaluate('document.fonts.ready.then(() => undefined)');
  await expect
    .poll(async () => page.evaluate<number>('document.documentElement.scrollWidth'))
    .toBeLessThanOrEqual(width);
  await expect
    .poll(async () =>
      row.evaluate((element: { scrollWidth: number; clientWidth: number }) => element.scrollWidth - element.clientWidth)
    )
    .toBe(0);

  const [origin, group] = await Promise.all([row.boundingBox(), proxies.group(GROUP).boundingBox()]);
  if (origin === null || group === null) throw new Error('Visible group or server row has no bounds');
  const controls = {
    field: proxies.normField(tag),
    actionSlot: action,
    normColumn: proxies.normCell(tag, 'norm'),
    identityColumn: proxies.normCell(tag, 'identity'),
    delayColumn: proxies.normCell(tag, 'delay'),
    ...(width >= DESKTOP_WIDTH ? { readingColumn: proxies.normCell(tag, 'reading') } : {}),
    statusColumn: proxies.normCell(tag, 'status'),
    adjacentRow: proxies.normRow(PEER),
  };
  const positions = await Promise.all(
    Object.entries(controls).map(async ([name, control]) => {
      const box = await control.boundingBox();
      if (box === null) throw new Error('Visible control has no bounds');
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);

      return [name, { ...box, x: box.x - origin.x, y: box.y - origin.y }] as const;
    })
  );

  return { row: { ...origin, x: origin.x - group.x, y: origin.y - group.y }, positions: Object.fromEntries(positions) };
}

async function putNorm(page: Page, tag: string, act: () => Promise<void>) {
  const [saved] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        new URL(response.url()).pathname === `${METADATA_ENDPOINT}/${encodeURIComponent(tag)}`
    ),
    act(),
  ]);

  const response: unknown = await saved.json();
  const request: unknown = saved.request().postDataJSON();

  return { response, request };
}

async function releaseLatencyResponse(page: Page, release: () => void) {
  const refreshed = page.waitForResponse(
    (response) => response.request().method() === 'GET' && new URL(response.url()).pathname === LATENCY_ENDPOINT
  );
  release();
  await refreshed;
}

for (const { width, height, touch } of VIEWPORTS) {
  test.describe(`proxy norm layout at ${String(width)} px`, () => {
    test.use({ viewport: { width, height }, hasTouch: touch, isMobile: touch });

    for (const theme of THEMES) {
      test(
        `keeps the row and controls fixed in ${theme}`,
        { tag: E2E_TAG.Mock },
        async ({ page, proxiesPage, applyBar }) => {
          await page.addInitScript((value) => {
            localStorage.setItem('theme', value);
          }, theme);
          const { applyRequests, metadataWrites } = await installProxyMock({ page, proxiesPage });
          await expect(page.locator('html')).toHaveCSS('color-scheme', theme);
          await expect(proxiesPage.normHeader(GROUP)).toBeVisible();
          expect(await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches)).toBe(touch);

          const row = proxiesPage.normRow(PRIMARY);
          const input = proxiesPage.normField(PRIMARY);
          const edit = proxiesPage.editNorm(PRIMARY);
          const save = proxiesPage.saveNorm(PRIMARY);
          const reset = proxiesPage.resetNorm(PRIMARY);
          const custom = row.getByText(translate(PROXY_GROUPS_NS, 'metadata.customNorm'), { exact: true });
          await edit.scrollIntoViewIfNeeded();
          const atRest = await geometry(page, proxiesPage, PRIMARY, edit, width);

          await test.step('Escape cancels without moving the row and returns focus', async () => {
            await expect(input).not.toBeEditable();
            await edit.press('Enter');
            await expect(input).toBeEditable();
            await expect(input).toBeFocused();
            expect(await geometry(page, proxiesPage, PRIMARY, save, width)).toEqual(atRest);
            await input.fill(String(MANUAL_MAX));
            await input.press('Escape');
            await expect(edit).toBeFocused();
            await expect(input).toHaveValue(String(COMPUTED));
            expect(await geometry(page, proxiesPage, PRIMARY, edit, width)).toEqual(atRest);
            expect(metadataWrites).toEqual([]);
          });

          await test.step('activates the field and saves the maximum without Apply', async () => {
            if (touch) await input.tap();
            else await input.click();
            await expect(input).toBeEditable();
            await input.fill(String(MANUAL_MAX));
            expect(await geometry(page, proxiesPage, PRIMARY, save, width)).toEqual(atRest);
            const { request, response } = await putNorm(page, PRIMARY, async () =>
              touch ? save.tap() : input.press('Enter')
            );
            expect(request).toEqual({ label: PRIMARY_LABEL, norm_ms: MANUAL_MAX });
            expect(response).toMatchObject({ [PEER]: { label: PEER_LABEL, norm_ms: PEER_MANUAL } });
            await expect(edit).toBeFocused();
            await expect(input).not.toBeEditable();
            await expect(input).toHaveValue(String(MANUAL_MAX));
            await expect(custom).toBeVisible();
            expect(await geometry(page, proxiesPage, PRIMARY, edit, width)).toEqual(atRest);
          });

          await test.step('keyboard reset restores the automatic norm in the same layout and preserves names', async () => {
            await expect(reset).toBeEnabled();
            await edit.press('Tab');
            await expect(reset).toBeFocused();
            const { request, response } = await putNorm(page, PRIMARY, async () => reset.press('Enter'));
            expect(request).toEqual({ label: PRIMARY_LABEL });
            expect(response).toEqual({
              [PRIMARY]: { label: PRIMARY_LABEL },
              [PEER]: { label: PEER_LABEL, norm_ms: PEER_MANUAL },
              [UNMEASURED]: { label: UNMEASURED_LABEL, norm_ms: UNMEASURED_MANUAL },
            });
            await expect(input).toHaveValue(String(COMPUTED));
            await expect(reset).toBeHidden();
            await expect(custom).toBeHidden();
            await expect(edit).toBeFocused();
            await expect(row.getByText(PRIMARY_LABEL, { exact: true })).toBeVisible();
            await expect(proxiesPage.normField(PEER)).toHaveValue(String(PEER_MANUAL));
            await expect(applyBar.region).toBeHidden();
            expect(await geometry(page, proxiesPage, PRIMARY, edit, width)).toEqual(atRest);
          });

          await test.step('reset with no measured norm keeps the row and neighboring columns fixed', async () => {
            const unmeasuredInput = proxiesPage.normField(UNMEASURED);
            const unmeasuredEdit = proxiesPage.editNorm(UNMEASURED);
            const unmeasuredReset = proxiesPage.resetNorm(UNMEASURED);
            await expect(unmeasuredInput).toHaveValue(String(UNMEASURED_MANUAL));
            await unmeasuredEdit.scrollIntoViewIfNeeded();
            const beforeReset = await geometry(page, proxiesPage, UNMEASURED, unmeasuredEdit, width);

            const { request } = await putNorm(page, UNMEASURED, async () => unmeasuredReset.press('Enter'));
            expect(request).toEqual({ label: UNMEASURED_LABEL });
            await expect(unmeasuredInput).toHaveValue('');
            await expect(unmeasuredInput).toHaveAttribute('placeholder', translate(PROXY_GROUPS_NS, 'metadata.noNorm'));
            await expect(unmeasuredEdit).toBeFocused();
            await expect(unmeasuredReset).toBeHidden();
            expect(await geometry(page, proxiesPage, UNMEASURED, unmeasuredEdit, width)).toEqual(beforeReset);
            expect(applyRequests).toEqual([]);
          });
        }
      );
    }
  });
}

test(
  'clears the norm immediately when a raw sample has no hourly median',
  { tag: E2E_TAG.Mock },
  async ({ page, proxiesPage, applyBar }) => {
    const mock = await installProxyMock({ page, proxiesPage }, UNMEASURED);
    const input = proxiesPage.normField(UNMEASURED);
    const meter = proxiesPage.normCell(UNMEASURED, 'meter');
    const marker = meter.locator('[data-slot="proxy-node-norm-marker"]');
    const currentDelay = proxiesPage
      .normCell(UNMEASURED, 'delay')
      .getByText(translate(SHARED_NS, 'delay.value', { value: PRIMARY_DELAY }), { exact: true });

    await expect(input).toHaveValue(String(UNMEASURED_MANUAL));
    await expect(currentDelay).toBeVisible();
    await expect(marker).toHaveAttribute('data-value', String(UNMEASURED_MANUAL));
    try {
      const { request } = await putNorm(page, UNMEASURED, async () => proxiesPage.resetNorm(UNMEASURED).click());
      expect(request).toEqual({ label: UNMEASURED_LABEL });
      await expect.poll(mock.refetches).toBeGreaterThan(0);
      await expect(input).toHaveValue('');
      await expect(input).toHaveAttribute('placeholder', translate(PROXY_GROUPS_NS, 'metadata.noNorm'));
      await expect(marker).toHaveCount(0);
      await expect(meter).toHaveAttribute('data-state', 'unknown');
      await expect(currentDelay).toBeVisible();
      await expect(proxiesPage.resetNorm(UNMEASURED)).toBeHidden();
      await expect(proxiesPage.normRow(UNMEASURED).getByText(UNMEASURED_LABEL, { exact: true })).toBeVisible();
      await expect(proxiesPage.normField(PEER)).toHaveValue(String(PEER_MANUAL));
      await releaseLatencyResponse(page, mock.releaseRefetch);
    } finally {
      mock.releaseRefetch();
    }
    await expect(input).toHaveValue('');
    await expect(meter).toHaveAttribute('data-state', 'unknown');
    await expect(applyBar.region).toBeHidden();
    expect(mock.applyRequests).toEqual([]);
  }
);

test(
  'updates the chart from current automatic data while refetch waits and preserves no-answer status',
  { tag: E2E_TAG.Mock },
  async ({ page, proxiesPage }) => {
    const mock = await installProxyMock({ page, proxiesPage }, PRIMARY);
    const meter = proxiesPage.normCell(PRIMARY, 'meter');
    const marker = meter.locator('[data-slot="proxy-node-norm-marker"]');
    const peerMeter = proxiesPage.normCell(PEER, 'meter');
    const peerFill = peerMeter.locator('[data-slot="proxy-node-meter-fill"]');
    const aboveUsual = proxiesPage
      .normCell(PRIMARY, 'status')
      .getByText(translate(PROXY_GROUPS_NS, 'metadata.aboveNorm'), { exact: true });
    const noAnswer = proxiesPage
      .normCell(PEER, 'status')
      .getByText(translate(SHARED_NS, 'delay.timedOut'), { exact: true });

    await expect(meter).toBeVisible();
    await expect(meter).toHaveAttribute('data-state', 'fast');
    await expect(marker).toHaveAttribute('data-value', String(MANUAL_MAX));
    await expect(aboveUsual).toBeHidden();
    await expect(peerMeter).toHaveAttribute('data-state', 'failed');
    await expect(peerFill).toHaveCount(0);
    await expect(noAnswer).toBeVisible();
    try {
      await putNorm(page, PRIMARY, async () => proxiesPage.resetNorm(PRIMARY).click());
      await expect.poll(mock.refetches).toBeGreaterThan(0);
      await expect(proxiesPage.normField(PRIMARY)).toHaveValue(String(COMPUTED));
      await expect(marker).toHaveAttribute('data-value', String(COMPUTED));
      await expect(meter).toHaveAttribute('data-state', 'unknown');
      await expect(aboveUsual).toBeHidden();
      await expect(peerMeter).toHaveAttribute('data-state', 'failed');
      await expect(noAnswer).toBeVisible();
      await releaseLatencyResponse(page, mock.releaseRefetch);
    } finally {
      mock.releaseRefetch();
    }
    await expect(meter).toHaveAttribute('data-state', 'slow');
    await expect(aboveUsual).toBeVisible();

    const { request } = await putNorm(page, PEER, async () => proxiesPage.resetNorm(PEER).click());
    expect(request).toEqual({ label: PEER_LABEL });
    await expect(proxiesPage.normField(PEER)).toHaveValue('');
    await expect(peerMeter).toHaveAttribute('data-state', 'failed');
    await expect(peerFill).toHaveCount(0);
    await expect(noAnswer).toBeVisible();
  }
);
