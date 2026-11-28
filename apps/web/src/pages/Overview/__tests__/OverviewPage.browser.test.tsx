import { worker } from '@test/browserWorker';
import { renderWithRouter } from '@test/renderWithRouter';
import { screen, waitFor, within } from '@testing-library/react';
import i18next from 'i18next';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { CONFIG_ENDPOINT } from '@entities/Config';
import { ConnectionStore } from '@entities/Connection';
import { DAEMON_ENDPOINT, RuntimeStore, SCHEMA_VERSION } from '@entities/Daemon';
import {
  CLASH_CONFIGS_FIXTURE,
  DAEMON_STATUS_FIXTURE,
  OUTBOUND_SYSTEM_FIXTURE,
  SERVICE_RUNNING_FIXTURE,
  TRAFFIC_HISTORY_FIXTURE,
} from '@entities/Daemon/__tests__/Daemon.fixture';
import { createDeviceHandlers } from '@entities/Device/__tests__/Device.handlers';
import { PROXY_ENDPOINT } from '@entities/Proxy';
import { CLASH_PROXIES_FIXTURE } from '@entities/Proxy/__tests__/Proxy.fixture';

import { OVERVIEW_NS } from '../i18n/Overview.namespace.generated';
import { OVERVIEW_ROUTED_CONFIG } from './Overview.fixture';
import { OverviewScreen } from './OverviewScreen';

const MINIMAL_CONFIG = JSON.stringify({ outbounds: [{ type: 'direct', tag: 'direct' }] }, null, 2);

function serveStatus() {
  worker.use(
    http.get(DAEMON_ENDPOINT.status(), () =>
      HttpResponse.json({
        ...DAEMON_STATUS_FIXTURE,
        core: { ...DAEMON_STATUS_FIXTURE.core, version: SCHEMA_VERSION },
      })
    ),
    http.get(DAEMON_ENDPOINT.clashConfigs(), () => HttpResponse.json(CLASH_CONFIGS_FIXTURE)),
    http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(SERVICE_RUNNING_FIXTURE)),
    http.get(PROXY_ENDPOINT.latency(), () => HttpResponse.json({ servers: [] })),
    http.get(PROXY_ENDPOINT.proxies(), () => HttpResponse.json({ proxies: {} })),
    http.get(DAEMON_ENDPOINT.history(), () => HttpResponse.json(TRAFFIC_HISTORY_FIXTURE)),
    http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(MINIMAL_CONFIG)),
    ...createDeviceHandlers()
  );
}

describe('overview screen picked with the mouse', () => {
  beforeEach(() => {
    ConnectionStore.getState().reset();
    RuntimeStore.getState().reset();
    serveStatus();
  });

  it('switches the Clash API mode with a runtime request', async () => {
    // On a narrow screen the process section is collapsed, and the mode switch is inside it.
    await page.viewport(1280, 900);
    const patches: unknown[] = [];
    worker.use(
      http.patch(DAEMON_ENDPOINT.clashConfigs(), async ({ request }) => {
        patches.push(await request.json());

        return new HttpResponse(null, { status: 204 });
      })
    );

    renderWithRouter(OverviewScreen);

    await userEvent.click(await screen.findByRole('combobox', { name: 'Режим Clash API: по правилам' }));
    await userEvent.click(await screen.findByRole('option', { name: 'напрямую' }));

    await waitFor(() => {
      expect(patches).toEqual([{ mode: 'Direct' }]);
    });
  });
});

describe('outbound rows on a phone', () => {
  beforeEach(async () => {
    ConnectionStore.getState().reset();
    RuntimeStore.getState().reset();
    serveStatus();
    await page.viewport(375, 812);
  });

  it.each([
    { language: 'en', theme: 'light', title: 'Outbounds and rules', volume: '30.0 MB', minutes: '10 min' },
    { language: 'en', theme: 'dark', title: 'Outbounds and rules', volume: '30.0 MB', minutes: '10 min' },
    { language: 'ru', theme: 'light', title: 'Выходы и правила', volume: '30.0 МБ', minutes: '10 мин' },
    { language: 'ru', theme: 'dark', title: 'Выходы и правила', volume: '30.0 МБ', minutes: '10 мин' },
  ])(
    'stacks the outbound, rules and readings without horizontal overflow at 375 px ($language, $theme)',
    async ({ language, theme, title, volume, minutes }) => {
      const serverTag = 'subscription-with-a-long-tag/'.repeat(7);
      const serverLabel = 'VeryLongServerNameWithoutSpaces'.repeat(2);
      const proxies = {
        ...CLASH_PROXIES_FIXTURE.proxies,
        proxy: { ...CLASH_PROXIES_FIXTURE.proxies.proxy, now: serverTag, all: [serverTag] },
        [serverTag]: { ...CLASH_PROXIES_FIXTURE.proxies['sub-eu/eu-reality'], name: serverTag },
      };
      worker.use(
        http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(OVERVIEW_ROUTED_CONFIG)),
        http.get(PROXY_ENDPOINT.proxies(), () => HttpResponse.json({ proxies })),
        http.get(PROXY_ENDPOINT.outbounds(), () =>
          HttpResponse.json({
            proxy: { label: 'VeryLongOutboundLabel'.repeat(3) },
            [serverTag]: { label: serverLabel },
          })
        )
      );
      RuntimeStore.getState().pushTraffic({ up: 8500, down: 43_400 });
      RuntimeStore.getState().pushSystem({ ...OUTBOUND_SYSTEM_FIXTURE, thermal: [] });
      const root = document.documentElement;
      const previousDark = root.classList.contains('dark');
      const previousLanguage = i18next.language;
      root.classList.toggle('dark', theme === 'dark');
      await i18next.changeLanguage(language);

      try {
        renderWithRouter(OverviewScreen);

        const table = await screen.findByRole('table', { name: title });
        const row = within(await within(table).findByRole('row', { name: /video\.example/ }));
        const server = await row.findByText(serverLabel, { exact: true });
        const rules = row.getByText(/video\.example/);
        const amount = row.getByText(volume);

        expect(server).toBeVisible();
        const [firstCell] = row.getAllByRole('cell');
        expect(within(firstCell).getByText(serverLabel, { exact: true })).toBeVisible();
        expect(server.getBoundingClientRect().bottom).toBeLessThan(rules.getBoundingClientRect().top);
        expect(rules.getBoundingClientRect().bottom).toBeLessThan(amount.getBoundingClientRect().top);
        expect(row.getByText(new RegExp(minutes))).toBeVisible();
        expect(table.scrollWidth).toBe(table.clientWidth);
        expect(root.scrollWidth).toBe(375);
      } finally {
        root.classList.toggle('dark', previousDark);
        await i18next.changeLanguage(previousLanguage);
      }
    }
  );
});

describe('traffic shares on a phone', () => {
  beforeEach(async () => {
    ConnectionStore.getState().reset();
    RuntimeStore.getState().reset();
    serveStatus();
    await page.viewport(375, 812);
  });

  it.each(['en', 'ru'])(
    'aligns the traffic shares and puts blocked connections below at 375 px (%s)',
    async (language) => {
      const t = i18next.getFixedT(language, OVERVIEW_NS);
      const { share } = OUTBOUND_SYSTEM_FIXTURE;
      const scale = 10 ** 7;
      RuntimeStore.getState().pushSystem({
        ...OUTBOUND_SYSTEM_FIXTURE,
        thermal: [],
        uplink: { name: 'pppoe-long-'.repeat(12), rx: 0, tx: 0 },
        share: {
          ...share,
          link: share.link * scale,
          proxy: share.proxy * scale,
          split: { ...share.split, proxy: share.split.proxy * scale, direct: share.split.direct * scale },
        },
      });

      const previousLanguage = i18next.language;
      await i18next.changeLanguage(language);

      try {
        renderWithRouter(OverviewScreen);

        const shares = await screen.findByLabelText(t('traffic.shares'));
        const proxy = within(shares).getByText('30%');
        const direct = within(shares).getByText('70%');
        const blocked = screen.getByText(t('traffic.blocked.label'));
        const proxyBounds = proxy.getBoundingClientRect();
        const directBounds = direct.getBoundingClientRect();

        expect(proxyBounds.right).toBeCloseTo(directBounds.right);
        expect(proxyBounds.bottom).toBeLessThan(directBounds.top);
        expect(directBounds.bottom).toBeLessThan(blocked.getBoundingClientRect().top);
        expect(shares.scrollWidth).toBe(shares.clientWidth);
        expect(document.documentElement.scrollWidth).toBe(375);
      } finally {
        await i18next.changeLanguage(previousLanguage);
      }
    }
  );

  it('opens and dismisses the internet connection help with the keyboard', async () => {
    RuntimeStore.getState().pushSystem({ ...OUTBOUND_SYSTEM_FIXTURE, thermal: [] });
    renderWithRouter(OverviewScreen);

    const name = 'Что такое интернет-подключение?';
    const trigger = await screen.findByRole('button', { name });
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    const help = await screen.findByRole('dialog', { name });
    expect(help).toHaveTextContent(i18next.getFixedT('ru', OVERVIEW_NS)('traffic.internetHelp'));

    await userEvent.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name })).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });
  });
});
