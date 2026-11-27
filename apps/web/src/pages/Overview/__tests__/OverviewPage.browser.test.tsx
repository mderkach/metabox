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
import { proxyHandlers } from '@entities/Proxy/__tests__/Proxy.handlers';

import { OVERVIEW_NS } from '../i18n/Overview.namespace.generated';
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

  it('switches the node of a selector group from the status strip and announces it', async () => {
    worker.use(...proxyHandlers);

    renderWithRouter(OverviewScreen);

    const region = await screen.findByRole('status', { name: 'Результат действия' });

    await userEvent.click(await screen.findByRole('combobox', { name: 'Выход группы us-fallback' }));
    await userEvent.click(await screen.findByRole('option', { name: 'proxy' }));

    await waitFor(() => {
      expect(region).toHaveTextContent('us-fallback: выбран выход proxy');
    });
  });

  it('shows member labels before tags and sends the selected tag to the core', async () => {
    const writes: unknown[] = [];
    worker.use(...proxyHandlers);
    worker.use(
      http.get(PROXY_ENDPOINT.outbounds(), () =>
        HttpResponse.json({ us: { label: 'America' }, proxy: { label: 'Europe' } })
      ),
      http.put(PROXY_ENDPOINT.proxy('us-fallback'), async ({ request }) => {
        writes.push(await request.json());

        return new HttpResponse(null, { status: 204 });
      })
    );

    renderWithRouter(OverviewScreen);

    const control = await screen.findByRole('combobox', { name: 'Выход группы us-fallback' });
    expect(await within(control).findByText('America', { exact: true })).toBeVisible();
    expect(within(control).getByText('us', { exact: true })).toHaveClass('font-mono');
    await userEvent.click(control);
    await userEvent.click(await screen.findByRole('option', { name: /Europe\s*proxy/ }));

    await waitFor(() => {
      expect(writes).toEqual([{ name: 'proxy' }]);
    });
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
