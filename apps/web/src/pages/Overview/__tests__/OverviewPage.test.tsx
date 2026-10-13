import { renderWithRouter } from '@test/renderWithRouter';
import { selectOption } from '@test/selectOption';
import { server } from '@test/server';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { CONFIG_ENDPOINT } from '@entities/Config';
import { ConnectionStore } from '@entities/Connection';
import { CONNECTIONS_FIXTURE, makeConnectionsSnapshot } from '@entities/Connection/__tests__/Connection.fixture';
import { DAEMON_ENDPOINT, RuntimeStore, SCHEMA_VERSION } from '@entities/Daemon';
import {
  CLASH_CONFIGS_FIXTURE,
  DAEMON_STATUS_FIXTURE,
  SERVICE_FAILED_FIXTURE,
  SERVICE_RUNNING_FIXTURE,
  SERVICE_UNREAD_FIXTURE,
  SYSTEM_FIXTURE,
  TRAFFIC_HISTORY_FIXTURE,
} from '@entities/Daemon/__tests__/Daemon.fixture';
import { PROXY_ENDPOINT } from '@entities/Proxy';
import { proxyHandlers } from '@entities/Proxy/__tests__/Proxy.handlers';

import { OverviewPage } from '../ui/OverviewPage';

function serveStatus(configPath?: string, singboxVersion = SCHEMA_VERSION) {
  server.use(
    http.get(DAEMON_ENDPOINT.status(), () =>
      HttpResponse.json({
        ...DAEMON_STATUS_FIXTURE,
        singbox_version: singboxVersion,
        config_path: configPath,
      })
    ),
    http.get(DAEMON_ENDPOINT.clashConfigs(), () => HttpResponse.json(CLASH_CONFIGS_FIXTURE)),
    // The service card and the verdict in the header read the same state: without
    // the mock the screen would show "state not read" instead of data.
    http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(SERVICE_RUNNING_FIXTURE)),
    http.get(PROXY_ENDPOINT.proxies(), () => HttpResponse.json({ proxies: {} })),
    http.get(DAEMON_ENDPOINT.history(), () => HttpResponse.json(TRAFFIC_HISTORY_FIXTURE)),
    // The connection stream reads the config for outbound types: without the mock the summary
    // would be computed by the substring table, not by the document.
    http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(MINIMAL_CONFIG))
  );
}

/** Beyond the stream drop threshold on the overview screen. */
const STALE_MS = 9000;

const MINIMAL_CONFIG = JSON.stringify({ outbounds: [{ type: 'direct', tag: 'direct' }] }, null, 2);

describe('overview screen', () => {
  beforeEach(() => {
    ConnectionStore.getState().reset();
    RuntimeStore.getState().reset();
    serveStatus();
  });

  it('shows speed from the stream, not the cumulative counter', async () => {
    RuntimeStore.getState().pushTraffic({ up: 8500, down: 43_400 });

    renderWithRouter(OverviewPage);

    const tiles = within(await screen.findByRole('list', { name: 'Скорость' }));

    expect(tiles.getByText('42.4 кБ/с')).toBeInTheDocument();
    expect(tiles.getByText('8.3 кБ/с')).toBeInTheDocument();
  });

  // The first stream sample is zero: showing "0 B" would
  // lie that the process needs no memory.
  it('does not show a line for a zero memory sample', async () => {
    RuntimeStore.getState().pushMemory({ inuse: 0, oslimit: 0 });

    renderWithRouter(OverviewPage);

    expect(await screen.findByText('sing-box')).toBeInTheDocument();
    expect(screen.queryByText('Память Go')).not.toBeInTheDocument();
  });

  it('shows Go memory when a non-empty sample arrived', async () => {
    RuntimeStore.getState().pushMemory({ inuse: 51_380_224, oslimit: 0 });

    renderWithRouter(OverviewPage);

    expect(await screen.findByText('49.0 МБ')).toBeInTheDocument();
  });

  it('counts connections by the stream snapshot', async () => {
    ConnectionStore.getState().apply(makeConnectionsSnapshot(7));

    renderWithRouter(OverviewPage);

    const counters = within(await screen.findByRole('list', { name: 'Счётчики соединений' }));

    expect(counters.getByText('7')).toBeInTheDocument();
  });

  it('names the peak of each direction in the traffic chart name', async () => {
    RuntimeStore.getState().pushTraffic({ up: 500, down: 20_000 });
    RuntimeStore.getState().pushTraffic({ up: 1000, down: 100_000 });

    renderWithRouter(OverviewPage);

    expect(
      await screen.findByRole('figure', { name: 'Трафик за минуту: входящий до 97.7 кБ/с, исходящий до 1000 Б/с' })
    ).toBeInTheDocument();
  });

  it('shows a live snapshot summary: route outbound, network types and top devices', async () => {
    ConnectionStore.getState().apply(CONNECTIONS_FIXTURE);

    renderWithRouter(OverviewPage);

    expect(await screen.findByText('Куда уходит трафик')).toBeInTheDocument();
    expect(screen.getByText('через прокси')).toBeInTheDocument();
    expect(screen.getByText('TCP')).toBeInTheDocument();
    expect(screen.getByText('192.168.1.60')).toBeInTheDocument();
  });

  // The mark stands once per section, not on every card: otherwise it
  // stops telling the observed from the computed.
  it('without live connections and selected nodes the summary cards say there is no data', async () => {
    renderWithRouter(OverviewPage);

    expect(await screen.findAllByText('Живых соединений нет')).not.toHaveLength(0);
    expect(await screen.findByText('Групп с выбранным узлом нет')).toBeInTheDocument();
  });

  // A measurement changes the numbers in place: visible to the eye, and for a screen reader the result
  // is announced by the screen live region.
  it('announces with a live region that the latency of the selected nodes is updated', async () => {
    server.use(...proxyHandlers);

    const user = userEvent.setup();

    renderWithRouter(OverviewPage);

    const region = await screen.findByRole('status', { name: 'Результат действия' });

    expect(region).toHaveTextContent(/^$/);

    await user.click(await screen.findByRole('button', { name: 'Проверить' }));

    await waitFor(() => {
      expect(region).toHaveTextContent('Задержка выбранных узлов обновлена');
    });
  });

  it('shows device readings as a separate section', async () => {
    RuntimeStore.getState().pushSystem({
      ...SYSTEM_FIXTURE,
      thermal: [{ name: 'cpu-thermal', celsius: 42.5 }],
    });

    renderWithRouter(OverviewPage);

    const cells = within(await screen.findByRole('list', { name: 'Показания устройства' }));

    expect(cells.getByText('42.5 °C')).toBeInTheDocument();
    expect(cells.getByText('0.49')).toBeInTheDocument();
  });

  // A leak and overheating show over hours of work, not over a minute of the tab: the series
  // come from the daemon history and name their window and range.
  it('shows sing-box memory and board readings together for the whole daemon history window', async () => {
    RuntimeStore.getState().pushSystem({ ...SYSTEM_FIXTURE, thermal: [{ name: 'cpu-thermal', celsius: 42.5 }] });

    renderWithRouter(OverviewPage);

    expect(
      await screen.findByRole('img', { name: 'Память процесса sing-box за время работы демона' })
    ).toBeInTheDocument();
    expect(screen.getAllByText(/^за 6 мин · от /)).toHaveLength(5);
  });

  // The panel is not always open: a minute of traffic accumulates at the daemon, and the chart
  // opens full, not from the moment the tab was opened.
  it('draws traffic and connection charts with the daemon minute before the first stream frame', async () => {
    renderWithRouter(OverviewPage);

    expect(await screen.findByRole('figure', { name: /Трафик за минуту/ })).toBeInTheDocument();
    expect(await screen.findByRole('figure', { name: /Открытые соединения за минуту/ })).toBeInTheDocument();
    expect(RuntimeStore.getState().traffic).toHaveLength(60);
    expect(ConnectionStore.getState().history).toHaveLength(60);
  });

  // The verdict answers the question the screen is opened for, and stands in the header.
  it('before the first runtime data says it is waiting for it', async () => {
    renderWithRouter(OverviewPage);

    expect(await screen.findByText('Ждём первые данные от sing-box')).toBeInTheDocument();
  });

  // The daemon serves `stopped` also when procd simply did not answer: such a response
  // is marked with a reason code, and it cannot be taken for a stop.
  it('does not pass an unread service state off as "not running"', async () => {
    server.use(http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(SERVICE_UNREAD_FIXTURE)));
    RuntimeStore.getState().pushTraffic({ up: 8500, down: 43_400 });

    renderWithRouter(OverviewPage);

    expect(await screen.findByText('Всё работает')).toBeInTheDocument();
    expect(screen.queryByText('sing-box не работает')).not.toBeInTheDocument();
  });

  it('names a confirmed service crash as the verdict', async () => {
    server.use(http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(SERVICE_FAILED_FIXTURE)));
    RuntimeStore.getState().pushTraffic({ up: 8500, down: 43_400 });

    renderWithRouter(OverviewPage);

    expect(await screen.findByText('sing-box не работает')).toBeInTheDocument();
  });

  // The stream is closed while the runtime screens are not open. A frame from a previous
  // connection says nothing about the liveness of the new one.
  it('after returning to the screen waits for the first data, not declares the stream stalled', async () => {
    RuntimeStore.getState().pushTraffic({ up: 8500, down: 43_400 });
    RuntimeStore.getState().closeStream();

    renderWithRouter(OverviewPage);

    expect(await screen.findByText('Ждём первые данные от sing-box')).toBeInTheDocument();
    expect(screen.queryByText('sing-box молчит')).not.toBeInTheDocument();
  });

  // Traffic stalling while device snapshots are live means sing-box is silent, not the link:
  // the snapshots are sent by the daemon itself.
  it('traffic stalled while device snapshots go: an alarm about sing-box and a link to the logs', async () => {
    RuntimeStore.getState().pushTraffic({ up: 8500, down: 43_400 });
    RuntimeStore.getState().pushSystem({ ...SYSTEM_FIXTURE, thermal: [{ name: 'cpu-thermal', celsius: 42.5 }] });
    RuntimeStore.setState({ sampledAt: Date.now() - STALE_MS });

    renderWithRouter(OverviewPage);

    expect(await screen.findByText('sing-box молчит')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Открыть логи' })).toHaveAttribute('href', '/logs');
  });

  // Both traffic and device snapshots stalled: the panel link to the daemon broke,
  // that says nothing about the router itself.
  it('both streams stalled: neutrally says there is no link to the daemon', async () => {
    RuntimeStore.getState().pushTraffic({ up: 8500, down: 43_400 });
    RuntimeStore.setState({ sampledAt: Date.now() - STALE_MS });

    renderWithRouter(OverviewPage);

    expect(await screen.findByText('Нет связи с демоном')).toBeInTheDocument();
    expect(screen.queryByText('sing-box молчит')).not.toBeInTheDocument();
  });

  it('with the service stopped advises where to look for the cause', async () => {
    server.use(http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(SERVICE_FAILED_FIXTURE)));
    RuntimeStore.getState().pushTraffic({ up: 8500, down: 43_400 });

    renderWithRouter(OverviewPage);

    expect(await screen.findByRole('link', { name: 'Открыть логи' })).toHaveAttribute('href', '/logs');
  });

  // The closed ones are accumulated by the tab, not the daemon: zero right after opening is the start
  // of the count, and the label says so the same way as with a non-zero counter.
  it('labels closed connections with the count since the tab was opened, also at zero', async () => {
    ConnectionStore.getState().apply(CONNECTIONS_FIXTURE);

    renderWithRouter(OverviewPage);

    const counters = within(await screen.findByRole('list', { name: 'Счётчики соединений' }));

    expect(counters.getByText('с открытия вкладки')).toBeInTheDocument();
  });

  // Channel is the whole outside interface, tiles are only sing-box: the numbers legitimately
  // differ, and the channel label must not read as their sum or a copy.
  it('labels channel speed by direction and separately from the sing-box tiles', async () => {
    RuntimeStore.getState().pushTraffic({ up: 8500, down: 43_400 });
    RuntimeStore.getState().pushSystem({ ...SYSTEM_FIXTURE, thermal: [{ name: 'cpu-thermal', celsius: 42.5 }] });
    RuntimeStore.setState({ uplink: { rx: 2048, tx: 1024 } });

    renderWithRouter(OverviewPage);

    expect(
      await screen.findByText('канал pppoe-wan сейчас: входящий 2.0 кБ/с, исходящий 1.0 кБ/с', { exact: false })
    ).toBeInTheDocument();
    expect(screen.getByText('sing-box: входящий')).toBeInTheDocument();
  });

  it('shows daemon availability and stream liveness', async () => {
    renderWithRouter(OverviewPage);

    expect(await screen.findByText('демон отвечает')).toBeInTheDocument();
    expect(screen.getByText('поток молчит')).toBeInTheDocument();
  });

  it('shows the Clash API mode in words, not as a response field: the clash_mode rule in the config is checked against it', async () => {
    renderWithRouter(OverviewPage);

    expect(await screen.findByText('по правилам')).toBeInTheDocument();
    expect(screen.queryByText('Rule')).not.toBeInTheDocument();
  });

  it('switches the Clash API mode with a runtime request', async () => {
    const patches: unknown[] = [];
    server.use(
      http.patch(DAEMON_ENDPOINT.clashConfigs(), async ({ request }) => {
        patches.push(await request.json());

        return new HttpResponse(null, { status: 204 });
      })
    );
    const user = userEvent.setup();

    renderWithRouter(OverviewPage);

    await selectOption(user, await screen.findByRole('combobox', { name: 'Режим Clash API: по правилам' }), 'напрямую');

    await waitFor(() => {
      expect(patches).toEqual([{ mode: 'Direct' }]);
    });
  });

  it('translates other mode values too, not only Rule', async () => {
    server.use(
      http.get(DAEMON_ENDPOINT.clashConfigs(), () => HttpResponse.json({ ...CLASH_CONFIGS_FIXTURE, mode: 'Global' }))
    );

    renderWithRouter(OverviewPage);

    expect(await screen.findByText('глобально')).toBeInTheDocument();
  });

  it('the config path is taken from the daemon: it is set by launch flags, not by the panel', async () => {
    serveStatus('/srv/sing-box/router.json');

    renderWithRouter(OverviewPage);

    expect(await screen.findByText('/srv/sing-box/router.json')).toBeInTheDocument();
  });

  it('a daemon without this field does not leave the screen without a path', async () => {
    renderWithRouter(OverviewPage);

    expect(await screen.findByText('/etc/sing-box/config.json')).toBeInTheDocument();
  });

  it('on a matching version there is no warning', async () => {
    renderWithRouter(OverviewPage);

    expect(await screen.findByText('демон отвечает')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
