import { renderWithRouter } from '@test/renderWithRouter';
import { server } from '@test/server';
import { stripWordJoiners, WITHOUT_WORD_JOINERS } from '@test/wordJoiner';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CONFIG_ENDPOINT } from '@entities/Config';
import { ConnectionStore } from '@entities/Connection';
import { CONNECTIONS_FIXTURE, makeConnectionsSnapshot } from '@entities/Connection/__tests__/Connection.fixture';
import { DAEMON_ENDPOINT, RuntimeStore, SCHEMA_VERSION } from '@entities/Daemon';
import {
  CLASH_CONFIGS_FIXTURE,
  DAEMON_STATUS_FIXTURE,
  OUTBOUND_SYSTEM_FIXTURE,
  SERVICE_FAILED_FIXTURE,
  SERVICE_RUNNING_FIXTURE,
  SERVICE_UNMANAGED_FIXTURE,
  SERVICE_UNREAD_FIXTURE,
  SYSTEM_FIXTURE,
  TRAFFIC_HISTORY_FIXTURE,
} from '@entities/Daemon/__tests__/Daemon.fixture';
import { createDeviceHandlers } from '@entities/Device/__tests__/Device.handlers';
import { DIAG_ENDPOINT } from '@entities/Diag';
import { DIAG_REPORT_FIXTURE } from '@entities/Diag/__tests__/Diag.fixture';
import { PROXY_ENDPOINT } from '@entities/Proxy';
import { CHECKED_AT, CLASH_PROXIES_FIXTURE } from '@entities/Proxy/__tests__/Proxy.fixture';
import { proxyHandlers } from '@entities/Proxy/__tests__/Proxy.handlers';

import { OverviewScreen } from './OverviewScreen';

function serveStatus(configPath?: string, singboxVersion = SCHEMA_VERSION) {
  server.use(
    http.get(DAEMON_ENDPOINT.status(), () =>
      HttpResponse.json({
        ...DAEMON_STATUS_FIXTURE,
        core: { ...DAEMON_STATUS_FIXTURE.core, version: singboxVersion },
        config_path: configPath,
      })
    ),
    http.get(DAEMON_ENDPOINT.clashConfigs(), () => HttpResponse.json(CLASH_CONFIGS_FIXTURE)),
    // The service card and the verdict in the header read the same state: without
    // the mock the screen would show "state not read" instead of data.
    http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(SERVICE_RUNNING_FIXTURE)),
    http.get(PROXY_ENDPOINT.latency(), () => HttpResponse.json({ servers: [] })),
    http.get(PROXY_ENDPOINT.outbounds(), () => HttpResponse.json({})),
    http.get(PROXY_ENDPOINT.proxies(), () => HttpResponse.json({ proxies: {} })),
    http.get(DAEMON_ENDPOINT.history(), () => HttpResponse.json(TRAFFIC_HISTORY_FIXTURE)),
    // The connection stream reads the config for outbound types: without the mock the summary
    // would be computed by the substring table, not by the document.
    http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(MINIMAL_CONFIG)),
    ...createDeviceHandlers()
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

  it('shows the core verdict in the header and keeps the core service card for commands', async () => {
    RuntimeStore.getState().pushTraffic({ up: 8500, down: 43_400 });

    renderWithRouter(OverviewScreen);

    expect(await screen.findByText('Всё работает')).toBeInTheDocument();
    const service = within(await screen.findByRole('region', { name: 'Состояние системы' }));
    expect(await service.findByRole('button', { name: 'Перезапустить' })).toBeEnabled();
    expect(service.getByRole('button', { name: 'Остановить' })).toBeEnabled();
    expect(service.queryByText('работает')).not.toBeInTheDocument();
  });

  it('shows a core started elsewhere in the header without offering service commands', async () => {
    server.use(http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(SERVICE_UNMANAGED_FIXTURE)));
    RuntimeStore.getState().pushTraffic({ up: 8500, down: 43_400 });

    renderWithRouter(OverviewScreen);

    expect(await screen.findByText('Ядро работает вне metabox')).toBeInTheDocument();
    const service = within(await screen.findByRole('region', { name: 'Состояние системы' }));
    expect(await service.findByRole('heading', { name: 'Ядро' })).toBeInTheDocument();
    expect(service.queryByRole('button', { name: /^(Перезапустить|Остановить|Запустить)$/ })).not.toBeInTheDocument();
    expect(service.queryByText('поднято другой службой')).not.toBeInTheDocument();
  });

  it('keeps the highlighted core restart in the service card and explains interrupted connections', async () => {
    const user = userEvent.setup();
    renderWithRouter(OverviewScreen);

    const service = within(await screen.findByRole('region', { name: 'Состояние системы' }));
    const restart = await service.findByRole('button', { name: 'Перезапустить' });
    expect(restart).toHaveClass('text-destructive');

    await user.click(restart);

    expect(screen.getByRole('alertdialog', { name: 'Перезапустить ядро?' })).toHaveAccessibleDescription(
      /Соединения через ядро могут прерваться/
    );
  });

  it('shows speed from the stream, not the cumulative counter', async () => {
    RuntimeStore.getState().pushTraffic({ up: 8500, down: 43_400 });

    renderWithRouter(OverviewScreen);

    const tiles = within(await screen.findByRole('list', { name: 'Скорость' }));

    expect(tiles.getByText('42.4 кБ/с', WITHOUT_WORD_JOINERS)).toBeInTheDocument();
    expect(tiles.getByText('8.3 кБ/с', WITHOUT_WORD_JOINERS)).toBeInTheDocument();
  });

  it('reconciles internet shares with the outbound totals for the same period', async () => {
    const system = { ...OUTBOUND_SYSTEM_FIXTURE, thermal: [] };
    RuntimeStore.getState().pushSystem(system);

    renderWithRouter(OverviewScreen);

    function expectShares() {
      const shares = within(screen.getByLabelText('Доли трафика'));
      expect(shares.getByText('30.0 МБ')).toBeInTheDocument();
      expect(shares.getByText('30%')).toBeInTheDocument();
      expect(shares.getByText('70.0 МБ')).toBeInTheDocument();
      expect(shares.getByText('70%')).toBeInTheDocument();
      expect(screen.getByText('Всего 100.0 МБ')).toBeInTheDocument();
    }

    expect(await screen.findByText('За 10 мин с запуска демона', WITHOUT_WORD_JOINERS)).toBeInTheDocument();
    expect(screen.getByText('pppoe-wan', { exact: true })).toBeInTheDocument();
    expect(system.outbounds.map(({ tag, bytes }) => [tag, bytes])).toEqual([
      ['direct', 20 * 1024 ** 2],
      ['proxy', 30 * 1024 ** 2],
    ]);
    expectShares();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Вычислено: доля «Напрямую»' }));
    expect(screen.getByRole('dialog', { name: 'Вычислено: доля «Напрямую»' })).toHaveTextContent(
      /50\.0 МБ трафика мимо ядра/
    );
    await user.keyboard('{Escape}');

    act(() => {
      RuntimeStore.getState().pushSystem({
        ...system,
        outbounds: system.outbounds.filter(({ tag }) => tag !== 'proxy'),
      });
    });

    expectShares();
  });

  it('normalizes both shares when the core volume exceeds the internet volume', async () => {
    const { share } = OUTBOUND_SYSTEM_FIXTURE;
    RuntimeStore.getState().pushSystem({
      ...OUTBOUND_SYSTEM_FIXTURE,
      thermal: [],
      share: { ...share, link: share.split.proxy },
    });

    renderWithRouter(OverviewScreen);

    const shares = within(await screen.findByLabelText('Доли трафика'));
    expect(shares.getByText('30.0 МБ')).toBeInTheDocument();
    expect(shares.getByText('60%')).toBeInTheDocument();
    expect(shares.getByText('20.0 МБ')).toBeInTheDocument();
    expect(shares.getByText('40%')).toBeInTheDocument();
  });

  it('distinguishes a missing traffic snapshot from a snapshot with zero traffic', async () => {
    renderWithRouter(OverviewScreen);

    expect(await screen.findByText('Ждём первый снимок трафика')).toBeInTheDocument();
    expect(screen.queryByLabelText('Доли трафика')).not.toBeInTheDocument();

    act(() => {
      RuntimeStore.getState().pushSystem({
        ...SYSTEM_FIXTURE,
        thermal: [],
        share: { link: 0, proxy: 0, split: { proxy: 0, direct: 0, block: 0 }, seconds: 4 },
      });
    });

    expect(screen.getByText('Собираем данные с запуска демона')).toBeInTheDocument();
    const shares = within(screen.getByLabelText('Доли трафика'));
    expect(shares.getAllByText('0 Б')).toHaveLength(2);
    expect(shares.getAllByText('0%')).toHaveLength(2);
  });

  it('marks both zero and nonzero blocked counts as computed from the core log', async () => {
    const system = { ...OUTBOUND_SYSTEM_FIXTURE, thermal: [] };
    RuntimeStore.getState().pushSystem(system);

    renderWithRouter(OverviewScreen);

    const mark = await screen.findByRole('button', { name: 'Вычислено из журнала ядра' });
    const user = userEvent.setup();

    expect(screen.getByText('3', { selector: 'data' })).toBeInTheDocument();
    await user.click(mark);
    expect(screen.getByRole('dialog', { name: 'Вычислено из журнала ядра' })).toHaveTextContent(/с запуска демона/);

    act(() => {
      RuntimeStore.getState().pushSystem({ ...system, blocked: { ...system.blocked, count: 0 } });
    });

    expect(screen.getByText('0', { selector: 'data' })).toBeInTheDocument();
  });

  it('explains the log levels when the blocked count is unavailable', async () => {
    RuntimeStore.getState().pushSystem({
      ...OUTBOUND_SYSTEM_FIXTURE,
      thermal: [],
      blocked: {
        origin: 'computed',
        reject: { used: true, visible: false },
        block: { used: true, visible: true },
      },
    });

    renderWithRouter(OverviewScreen);

    const help = await screen.findByRole('button', { name: 'Почему число блокировок недоступно' });
    expect(screen.getByText('Недоступно', { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Вычислено из журнала ядра' })).not.toBeInTheDocument();

    await userEvent.setup().click(help);

    expect(screen.getByRole('dialog', { name: 'Почему число блокировок недоступно' })).toHaveTextContent(
      /log\.level.*reject.*debug.*block.*info.*Примените конфиг/
    );
  });

  it('does not show a partial blocked count even when earlier log lines are the only gap', async () => {
    RuntimeStore.getState().pushSystem({
      ...OUTBOUND_SYSTEM_FIXTURE,
      thermal: [],
      blocked: { ...OUTBOUND_SYSTEM_FIXTURE.blocked, incomplete: true, count: 7 },
    });

    renderWithRouter(OverviewScreen);

    expect(await screen.findByText('Недоступно', { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Вычислено из журнала ядра' })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Почему число блокировок недоступно' }));
    expect(screen.getByRole('dialog', { name: 'Почему число блокировок недоступно' })).toHaveTextContent(
      /Часть ранних записей журнала/
    );
  });

  // The first stream sample is zero: showing "0 B" would
  // lie that the process needs no memory.
  it('does not show a line for a zero memory sample', async () => {
    RuntimeStore.getState().pushMemory({ inuse: 0, oslimit: 0 });

    renderWithRouter(OverviewScreen);

    expect(await screen.findByRole('heading', { name: 'Ядро', level: 3 })).toBeInTheDocument();
    expect(screen.queryByText('Память Go')).not.toBeInTheDocument();
  });

  it('shows Go memory when a non-empty sample arrived', async () => {
    RuntimeStore.getState().pushMemory({ inuse: 51_380_224, oslimit: 0 });

    renderWithRouter(OverviewScreen);

    expect(await screen.findByText('49.0 МБ')).toBeInTheDocument();
  });

  it('counts connections by the stream snapshot', async () => {
    ConnectionStore.getState().apply(makeConnectionsSnapshot(7));

    renderWithRouter(OverviewScreen);

    expect(await screen.findByText('7')).toBeInTheDocument();
  });

  it('names the peak of each direction in the traffic chart name', async () => {
    RuntimeStore.getState().pushTraffic({ up: 500, down: 20_000 });
    RuntimeStore.getState().pushTraffic({ up: 1000, down: 100_000 });

    renderWithRouter(OverviewScreen);

    expect(
      await screen.findByRole('figure', {
        name: (name) => stripWordJoiners(name) === 'Трафик за минуту: скачивание до 97.7 кБ/с, отправка до 1000 Б/с',
      })
    ).toBeInTheDocument();
  });

  it('shows a live snapshot summary: route outbound, network types and top devices', async () => {
    ConnectionStore.getState().apply(CONNECTIONS_FIXTURE);

    renderWithRouter(OverviewScreen);

    expect(await screen.findByText('Куда уходит трафик')).toBeInTheDocument();
    expect(screen.getByText('через прокси')).toBeInTheDocument();
    expect(screen.getByText('TCP')).toBeInTheDocument();
    expect(screen.getByText('192.168.1.60')).toBeInTheDocument();
  });

  // The mark stands once per section, not on every card: otherwise it
  // stops telling the observed from the computed.
  it('without live connections and selected nodes the summary cards say there is no data', async () => {
    ConnectionStore.getState().apply(makeConnectionsSnapshot(0));

    renderWithRouter(OverviewScreen);

    expect(await screen.findAllByText('Живых соединений нет')).not.toHaveLength(0);
    expect(await screen.findByText('Нет доступных серверов')).toBeInTheDocument();
  });

  // A measurement changes the numbers in place: visible to the eye, and for a screen reader the result
  // is announced by the screen live region.
  it('announces with a live region that the latency of the selected nodes is updated', async () => {
    server.use(...proxyHandlers);

    const user = userEvent.setup();

    renderWithRouter(OverviewScreen);

    const region = await screen.findByRole('status', { name: 'Результат действия' });

    expect(region).toHaveTextContent(/^$/);

    await user.click(await screen.findByRole('button', { name: 'Проверить' }));

    await waitFor(() => {
      expect(region).toHaveTextContent('Задержка обновлена');
    });
  });

  it('gates current delay on a manual check in this core run and retains history after restart', async () => {
    const tag = 'standalone';
    const recent = [{ at: CHECKED_AT, delay_ms: 55 }];
    const current = { at: '2026-09-10T19:30:00Z', delay_ms: 120 };
    const requested = vi.fn<() => void>();
    let checked = false;
    let restarted = false;
    let available = true;
    const automatic = { at: '2026-09-10T19:32:00Z', delay_ms: 80 };
    const runtime = { ...SYSTEM_FIXTURE, thermal: [], singbox: { pid: 5872, rss: 85_913_600 } };
    RuntimeStore.getState().pushSystem(runtime);
    server.use(
      http.get(PROXY_ENDPOINT.proxies(), () =>
        HttpResponse.json({
          proxies: {
            direct: CLASH_PROXIES_FIXTURE.proxies.direct,
            [tag]: { name: tag, type: 'VLESS', udp: true, history: [{ time: CHECKED_AT, delay: restarted ? 80 : 70 }] },
          },
        })
      ),
      http.get(PROXY_ENDPOINT.latency(), () =>
        HttpResponse.json({
          available,
          servers: [
            {
              tag,
              recent: [...recent, ...(checked ? [current] : []), ...(restarted ? [automatic] : [])],
              hourly: [],
              usual_ms: 55,
              computed_usual_ms: 55,
              ...(checked && !restarted ? { current, level: 'above_norm' } : { level: 'no_measurement' }),
              origin: 'computed',
            },
          ],
        })
      ),
      http.get(PROXY_ENDPOINT.proxyDelay(tag), () => {
        requested();
        checked = true;

        return HttpResponse.json({ delay: current.delay_ms, time: current.at });
      })
    );
    const user = userEvent.setup();

    renderWithRouter(OverviewScreen);

    const check = await screen.findByRole('button', { name: 'Проверить задержку standalone' });
    expect(screen.queryByRole('button', { name: 'Проверить задержку direct' })).not.toBeInTheDocument();
    expect(screen.getByText('Нет замера')).toBeInTheDocument();
    expect(screen.queryByText('70 мс')).not.toBeInTheDocument();
    expect(requested).not.toHaveBeenCalled();

    const details = await screen.findByRole('group', { name: 'Замеры standalone' });
    await user.click(within(details).getByText('Последние замеры'));
    expect(details).toHaveAttribute('open');
    expect(within(details).getByText('55 мс')).toBeVisible();

    await user.click(check);
    expect(await screen.findByText('Выше нормы')).toBeInTheDocument();
    expect(screen.getByText('Обычно 55 мс (расчёт)')).toBeInTheDocument();
    expect(screen.queryByText('Нет замера')).not.toBeInTheDocument();

    restarted = true;
    act(() => {
      RuntimeStore.getState().pushSystem({ ...runtime, singbox: { ...runtime.singbox, pid: 5873 } });
    });

    expect(await screen.findByText('Нет замера')).toBeInTheDocument();
    expect(await screen.findByText('Обычно 55 мс (расчёт)')).toBeInTheDocument();
    expect(screen.queryByText('Выше нормы')).not.toBeInTheDocument();
    expect(await within(details).findByText('120 мс')).toBeVisible();
    expect(await within(details).findByText('80 мс')).toBeVisible();

    available = false;
    act(() => {
      RuntimeStore.getState().pushSystem({ ...runtime, singbox: { ...runtime.singbox, pid: 5874 } });
    });

    expect(await screen.findByText('Замер недоступен')).toBeInTheDocument();
    expect(check).toHaveAttribute('aria-disabled', 'true');
    expect(within(details).getByText('80 мс')).toBeVisible();
    expect(requested).toHaveBeenCalledTimes(1);
  });

  // A URL test picks its node itself: a switch there would be undone by the next measurement.
  it('offers no switch for a group that picks its node by latency', async () => {
    server.use(...proxyHandlers);

    renderWithRouter(OverviewScreen);

    expect(await screen.findByRole('combobox', { name: 'Выход группы us-fallback' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Выход группы proxy' })).not.toBeInTheDocument();
  });

  // A check sends packets from the router: it runs on the button only, and a failure leads
  // to the screen with the checks themselves.
  it('runs the quick check on demand and folds a failure into its area', async () => {
    const requested = vi.fn<() => void>();

    server.use(
      ...proxyHandlers,
      http.get(DIAG_ENDPOINT.report(), () => {
        requested();

        return HttpResponse.json(DIAG_REPORT_FIXTURE);
      })
    );

    const user = userEvent.setup();

    renderWithRouter(OverviewScreen);

    const region = await screen.findByRole('status', { name: 'Результат действия' });

    expect(requested).not.toHaveBeenCalled();

    await user.click(await screen.findByRole('button', { name: 'Запустить проверку' }));

    const results = within(await screen.findByRole('list', { name: 'Результаты проверки' }));

    const [interception, dns, proxy] = results.getAllByRole('listitem');

    expect(interception).toHaveTextContent('Перехватне пройдено');
    expect(dns).toHaveTextContent('DNSпройдено');
    expect(proxy).toHaveTextContent('Через проксипройдено182 мс');
    expect(screen.getByRole('link', { name: 'Подробности в диагностике' })).toBeInTheDocument();
    await waitFor(() => {
      expect(region).toHaveTextContent('Быстрая проверка нашла проблему');
    });
  });

  it('shows device readings as a separate section', async () => {
    RuntimeStore.getState().pushSystem({
      ...SYSTEM_FIXTURE,
      thermal: [{ name: 'cpu-thermal', celsius: 42.5 }],
    });

    renderWithRouter(OverviewScreen);

    const cells = within(await screen.findByRole('list', { name: 'Показания устройства' }));

    expect(cells.getByText('42.5 °C')).toBeInTheDocument();
    expect(cells.getByText('0.49')).toBeInTheDocument();
  });

  // A leak and overheating show over hours of work, not over a minute of the tab: the series
  // come from the daemon history and name their window and range.
  it('shows sing-box memory and board readings together for the whole daemon history window', async () => {
    RuntimeStore.getState().pushSystem({ ...SYSTEM_FIXTURE, thermal: [{ name: 'cpu-thermal', celsius: 42.5 }] });

    renderWithRouter(OverviewScreen);

    expect(await screen.findByRole('img', { name: 'Память процесса ядра за время работы демона' })).toBeInTheDocument();
    expect(screen.getAllByText(/^за 13 мин · от /)).toHaveLength(5);
  });

  // The panel is not always open: a minute of traffic accumulates at the daemon, and the chart
  // opens full, not from the moment the tab was opened.
  it('draws traffic and connection charts with the daemon minute before the first stream frame', async () => {
    renderWithRouter(OverviewScreen);

    expect(await screen.findByRole('figure', { name: /Трафик за минуту/ })).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'Открытые соединения за минуту' })).toBeInTheDocument();
    expect(RuntimeStore.getState().traffic).toHaveLength(60);
    expect(ConnectionStore.getState().history).toHaveLength(60);
  });

  it('shows an outbound label before the original tag on Overview', async () => {
    server.use(
      http.get(PROXY_ENDPOINT.proxies(), () => HttpResponse.json(CLASH_PROXIES_FIXTURE)),
      http.get(PROXY_ENDPOINT.outbounds(), () => HttpResponse.json({ 'us-fallback': { label: 'Work traffic' } }))
    );

    renderWithRouter(OverviewScreen);

    expect(
      await screen.findByRole('combobox', { name: 'Выход группы Work traffic · us-fallback' })
    ).toBeInTheDocument();
    const row = screen.getAllByRole('listitem').find((item) => within(item).queryByText('Work traffic') !== null);
    expect(row).toHaveTextContent(/Work traffic\s*us-fallback/);
    expect(screen.getByText('us-fallback', { selector: 'span.font-mono' })).toBeInTheDocument();
  });

  // The verdict answers the question the screen is opened for, and stands in the header.
  it('before the first runtime data says it is waiting for it', async () => {
    renderWithRouter(OverviewScreen);

    expect(await screen.findByText('Ждём данные от ядра')).toBeInTheDocument();
  });

  // The daemon serves `stopped` also when procd simply did not answer: such a response
  // is marked with a reason code, and it cannot be taken for a stop.
  it('does not pass an unread service state off as "not running"', async () => {
    server.use(http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(SERVICE_UNREAD_FIXTURE)));
    RuntimeStore.getState().pushTraffic({ up: 8500, down: 43_400 });

    renderWithRouter(OverviewScreen);

    expect(await screen.findByText('Всё работает')).toBeInTheDocument();
    expect(screen.queryByText('Ядро не работает')).not.toBeInTheDocument();
  });

  it('names a confirmed service crash as the verdict', async () => {
    server.use(http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(SERVICE_FAILED_FIXTURE)));
    RuntimeStore.getState().pushTraffic({ up: 8500, down: 43_400 });

    renderWithRouter(OverviewScreen);

    expect(await screen.findByText('Ядро не работает')).toBeInTheDocument();
  });

  // The stream is closed while the runtime screens are not open. A frame from a previous
  // connection says nothing about the liveness of the new one.
  it('after returning to the screen waits for the first data, not declares the stream stalled', async () => {
    RuntimeStore.getState().pushTraffic({ up: 8500, down: 43_400 });
    RuntimeStore.getState().closeStream();

    renderWithRouter(OverviewScreen);

    expect(await screen.findByText('Ждём данные от ядра')).toBeInTheDocument();
    expect(screen.queryByText('Нет данных от ядра')).not.toBeInTheDocument();
  });

  // Traffic stalling while device snapshots are live means sing-box is silent, not the link:
  // the snapshots are sent by the daemon itself.
  it('traffic stalled while device snapshots go: an alarm about sing-box and a link to the logs', async () => {
    RuntimeStore.getState().pushTraffic({ up: 8500, down: 43_400 });
    RuntimeStore.getState().pushSystem({ ...SYSTEM_FIXTURE, thermal: [{ name: 'cpu-thermal', celsius: 42.5 }] });
    RuntimeStore.setState({ sampledAt: Date.now() - STALE_MS });

    renderWithRouter(OverviewScreen);

    expect(await screen.findByText('Нет данных от ядра')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Открыть логи' })).toHaveAttribute('href', '/logs');
  });

  // Both traffic and device snapshots stalled: the panel link to the daemon broke,
  // that says nothing about the router itself.
  it('both streams stalled: neutrally says there is no link to the daemon', async () => {
    RuntimeStore.getState().pushTraffic({ up: 8500, down: 43_400 });
    RuntimeStore.setState({ sampledAt: Date.now() - STALE_MS });

    renderWithRouter(OverviewScreen);

    expect(await screen.findByText('Нет связи с демоном')).toBeInTheDocument();
    expect(screen.queryByText('Нет данных от ядра')).not.toBeInTheDocument();
    // Without the daemon link the silence is not the core's: blocks do not blame it.
    expect(screen.queryByText('Данные от ядра не поступают.')).not.toBeInTheDocument();
  });

  it('with the service stopped advises where to look for the cause', async () => {
    server.use(http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(SERVICE_FAILED_FIXTURE)));
    RuntimeStore.getState().pushTraffic({ up: 8500, down: 43_400 });

    renderWithRouter(OverviewScreen);

    expect(await screen.findByRole('link', { name: 'Открыть логи' })).toHaveAttribute('href', '/logs');
  });

  describe('without core data', () => {
    const STOPPED = 'Ядро не запущено, данных нет.';
    const SILENT = 'Данные от ядра не поступают.';
    const CORE_CARDS = [
      'Куда уходит трафик',
      'Открытые соединения',
      'Типы сети',
      'Топ серверов прокси',
      'Топ устройств',
    ];

    async function card(title: string) {
      // oxlint-disable-next-line testing-library/no-node-access -- a summary card has no role of its own, its heading is the only handle
      const element = (await screen.findByRole('heading', { name: title })).closest('[data-slot="card"]');

      if (!(element instanceof HTMLElement)) {
        throw new Error(`no card titled ${title}`);
      }

      return within(element);
    }

    function rateTile(label: string) {
      return within(screen.getByRole('list', { name: 'Скорость' }))
        .getAllByRole('listitem')
        .find((item) => within(item).queryByText(label) !== null);
    }

    afterEach(() => {
      vi.useRealTimers();
    });

    // A stopped core sends no traffic and no connections: a skeleton there would wait forever.
    it('with the core stopped says there is no data instead of loading, daemon readings stay', async () => {
      server.use(http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(SERVICE_FAILED_FIXTURE)));
      RuntimeStore.getState().pushSystem({ ...SYSTEM_FIXTURE, thermal: [{ name: 'cpu-thermal', celsius: 42.5 }] });

      renderWithRouter(OverviewScreen);

      expect(await (await card('Всего передано')).findByText(STOPPED)).toBeInTheDocument();

      for (const title of [...CORE_CARDS, 'Задержка серверов']) {
        expect((await card(title)).getByText(STOPPED)).toBeInTheDocument();
      }

      const down = rateTile('Ядро: скачивание');

      expect(down?.textContent).toBe('Ядро: скачивание—нет данных');
      expect(within(down ?? document.body).getByText('—')).toHaveAttribute('aria-hidden', 'true');
      expect(within(screen.getByLabelText('Доли трафика')).getByText('30.0 МБ')).toBeInTheDocument();
      expect(screen.getByText(/Ядро остановлено\. Новые данные/)).toBeInTheDocument();
      expect(await screen.findByRole('figure', { name: /Трафик за минуту/ })).toBeInTheDocument();
      expect((await card('Задержка серверов')).getByRole('button', { name: 'Проверить' })).toBeDisabled();
    });

    // The action is named once, in the header, by what the user sees on screen.
    it('with the core stopped the header names the card and the button that start it', async () => {
      server.use(http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(SERVICE_FAILED_FIXTURE)));

      renderWithRouter(OverviewScreen);

      const status = within(await screen.findByRole('region', { name: 'Состояние системы' }));
      const start = await status.findByRole('button', { name: 'Запустить' });
      const title = status.getByRole('heading', { name: 'Ядро' }).textContent;

      expect(
        screen.getByText(
          `Трафик через ядро не идёт. Запустите его кнопкой «${start.textContent}» в карточке «${title}» ниже. Причину остановки ищите в логе.`
        )
      ).toBeInTheDocument();
    });

    it('with the core stopped the node card shows no latency as current', async () => {
      server.use(
        ...proxyHandlers,
        http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(SERVICE_FAILED_FIXTURE))
      );

      renderWithRouter(OverviewScreen);

      expect(await (await card('Выбор выхода')).findByText(STOPPED)).toBeInTheDocument();
      expect((await card('Выбор выхода')).queryByRole('combobox')).not.toBeInTheDocument();
      expect((await card('Выбор выхода')).queryByText(/мс$/)).not.toBeInTheDocument();
    });

    it('past the drop threshold without a first frame stops loading and says no data comes from the core', async () => {
      vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
      RuntimeStore.getState().pushSystem({ ...SYSTEM_FIXTURE, thermal: [{ name: 'cpu-thermal', celsius: 42.5 }] });

      renderWithRouter(OverviewScreen);

      expect(await screen.findByText('Ждём данные от ядра')).toBeInTheDocument();
      expect(screen.queryByText(SILENT)).not.toBeInTheDocument();
      expect(screen.queryByText('Живых соединений нет')).not.toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(STALE_MS);
      });

      for (const title of [...CORE_CARDS, 'Всего передано']) {
        expect((await card(title)).getByText(SILENT)).toBeInTheDocument();
      }

      expect(within(screen.getByRole('list', { name: 'Скорость' })).getAllByText('—')).toHaveLength(2);
    });

    // The header says no data comes from the core: the tiles must not keep the last frame as current.
    it('with the core silent after frames does not show the last numbers as current', async () => {
      RuntimeStore.getState().pushTraffic({ up: 8500, down: 43_400 });
      RuntimeStore.getState().pushSystem({ ...SYSTEM_FIXTURE, thermal: [{ name: 'cpu-thermal', celsius: 42.5 }] });
      RuntimeStore.setState({ sampledAt: Date.now() - STALE_MS });
      ConnectionStore.getState().apply(makeConnectionsSnapshot(7));
      ConnectionStore.setState({ sampledAt: Date.now() - STALE_MS });

      renderWithRouter(OverviewScreen);

      expect(await screen.findByText('Нет данных от ядра')).toBeInTheDocument();
      expect((await card('Открытые соединения')).getByText(SILENT)).toBeInTheDocument();
      expect((await card('Типы сети')).getByText(SILENT)).toBeInTheDocument();
      expect(screen.queryByText('7')).not.toBeInTheDocument();
      expect(rateTile('Ядро: скачивание')?.textContent).toBe('Ядро: скачивание—нет данных');
      expect(screen.queryByText('42.4 кБ/с', WITHOUT_WORD_JOINERS)).not.toBeInTheDocument();
    });

    // The last frames of a stopped core would read as current speed and connections.
    it('with the core stopped after frames does not show the last numbers as current', async () => {
      server.use(http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(SERVICE_FAILED_FIXTURE)));
      RuntimeStore.getState().pushTraffic({ up: 8500, down: 43_400 });
      RuntimeStore.getState().pushMemory({ inuse: 51_380_224, oslimit: 0 });
      ConnectionStore.getState().apply(makeConnectionsSnapshot(7));

      renderWithRouter(OverviewScreen);

      expect(await (await card('Открытые соединения')).findByText(STOPPED)).toBeInTheDocument();

      for (const title of [...CORE_CARDS, 'Всего передано']) {
        expect((await card(title)).getByText(STOPPED)).toBeInTheDocument();
      }

      expect(screen.queryByText('42.4 кБ/с', WITHOUT_WORD_JOINERS)).not.toBeInTheDocument();
      expect(screen.queryByText('7')).not.toBeInTheDocument();
      expect(screen.queryByText('Память Go')).not.toBeInTheDocument();
      expect(screen.queryByRole('img', { name: 'Открытые соединения за минуту' })).not.toBeInTheDocument();
    });

    // Frames from before the stop describe the previous run, and the time spent stopped is not a silent core.
    it('after the core is started waits for its first frame anew', async () => {
      vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });

      let state = SERVICE_FAILED_FIXTURE;

      server.use(
        http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(state)),
        http.post(DAEMON_ENDPOINT.serviceAction(':action'), () => {
          state = SERVICE_RUNNING_FIXTURE;

          return HttpResponse.json(state);
        })
      );
      RuntimeStore.getState().pushTraffic({ up: 8500, down: 43_400 });
      ConnectionStore.getState().apply(makeConnectionsSnapshot(7));

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      renderWithRouter(OverviewScreen);

      await (await card('Открытые соединения')).findByText(STOPPED);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(STALE_MS);
      });
      await user.click(screen.getByRole('button', { name: 'Запустить' }));

      expect(await screen.findByText('Ядро запускается: числа появятся через несколько секунд.')).toBeInTheDocument();

      const tiles = within(screen.getByRole('list', { name: 'Скорость' }));

      expect(tiles.queryByText('—')).not.toBeInTheDocument();
      expect(tiles.queryByText('42.4 кБ/с', WITHOUT_WORD_JOINERS)).not.toBeInTheDocument();
      expect(screen.queryByText(SILENT)).not.toBeInTheDocument();
      expect(screen.queryByText(STOPPED)).not.toBeInTheDocument();
      expect(screen.queryByText('Живых соединений нет')).not.toBeInTheDocument();
      expect(screen.queryByText('7')).not.toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(STALE_MS);
      });

      expect((await card('Открытые соединения')).getByText(SILENT)).toBeInTheDocument();
    });
  });

  // The closed ones are accumulated by the tab, not the daemon: zero right after opening is the start
  // of the count, and the label says so the same way as with a non-zero counter.
  it('labels closed connections with the count since the tab was opened, also at zero', async () => {
    ConnectionStore.getState().apply(CONNECTIONS_FIXTURE);

    renderWithRouter(OverviewScreen);

    expect(await screen.findByText('закрыто с открытия вкладки: 0')).toBeInTheDocument();
  });

  // Channel is the whole outside interface, tiles are only sing-box: the numbers legitimately
  // differ, and the channel label must not read as their sum or a copy.
  it('labels channel speed by direction and separately from the sing-box tiles', async () => {
    RuntimeStore.getState().pushTraffic({ up: 8500, down: 43_400 });
    RuntimeStore.getState().pushSystem({ ...SYSTEM_FIXTURE, thermal: [{ name: 'cpu-thermal', celsius: 42.5 }] });
    RuntimeStore.setState({ uplink: { rx: 2048, tx: 1024 } });

    renderWithRouter(OverviewScreen);

    expect(
      await screen.findByText('интернет-подключение pppoe-wan сейчас: скачивание 2.0 кБ/с, отправка 1.0 кБ/с', {
        exact: false,
        ...WITHOUT_WORD_JOINERS,
      })
    ).toBeInTheDocument();
    expect(screen.getByText('Ядро: скачивание')).toBeInTheDocument();
  });

  it('shows daemon availability and stream liveness', async () => {
    renderWithRouter(OverviewScreen);

    expect(await screen.findByText('демон отвечает')).toBeInTheDocument();
    expect(screen.getByText('поток молчит')).toBeInTheDocument();
  });

  it('shows the Clash API mode in words, not as a response field: the clash_mode rule in the config is checked against it', async () => {
    renderWithRouter(OverviewScreen);

    expect(await screen.findByText('по правилам')).toBeInTheDocument();
    expect(screen.queryByText('Rule')).not.toBeInTheDocument();
  });

  it('translates other mode values too, not only Rule', async () => {
    server.use(
      http.get(DAEMON_ENDPOINT.clashConfigs(), () => HttpResponse.json({ ...CLASH_CONFIGS_FIXTURE, mode: 'Global' }))
    );

    renderWithRouter(OverviewScreen);

    expect(await screen.findByText('глобально')).toBeInTheDocument();
  });

  it('the config path is taken from the daemon: it is set by launch flags, not by the panel', async () => {
    serveStatus('/srv/sing-box/router.json');

    renderWithRouter(OverviewScreen);

    expect(await screen.findByText('/srv/sing-box/router.json')).toBeInTheDocument();
  });

  it('a daemon without this field does not leave the screen without a path', async () => {
    renderWithRouter(OverviewScreen);

    expect(await screen.findByText('/etc/sing-box/config.json')).toBeInTheDocument();
  });

  it('on a matching version there is no warning', async () => {
    renderWithRouter(OverviewScreen);

    expect(await screen.findByText('демон отвечает')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

const narrowListeners = new Set<(event: { matches: boolean }) => void>();

describe('overview screen on a phone', () => {
  beforeEach(() => {
    ConnectionStore.getState().reset();
    RuntimeStore.getState().reset();
    serveStatus();
    narrowListeners.clear();
    vi.stubGlobal('matchMedia', function matchNarrowQuery(media: string) {
      return {
        matches: true,
        media,
        addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => {
          narrowListeners.add(listener);
        },
        removeEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => {
          narrowListeners.delete(listener);
        },
      };
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the folded sections when the screen gets wide', async () => {
    RuntimeStore.getState().pushSystem({ ...SYSTEM_FIXTURE, thermal: [{ name: 'cpu-thermal', celsius: 42.5 }] });
    renderWithRouter(OverviewScreen);

    await screen.findByRole('button', { name: 'Роутер' });

    act(() => {
      for (const listener of narrowListeners) {
        listener({ matches: false });
      }
    });

    expect(screen.queryByRole('button', { name: 'Роутер' })).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Показания устройства' })).toBeInTheDocument();
  });

  it('keeps board and process readings folded until their title is pressed', async () => {
    const user = userEvent.setup();

    RuntimeStore.getState().pushSystem({ ...SYSTEM_FIXTURE, thermal: [{ name: 'cpu-thermal', celsius: 42.5 }] });
    renderWithRouter(OverviewScreen);

    const device = await screen.findByRole('button', { name: 'Роутер' });

    expect(device).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Процессы' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list', { name: 'Показания устройства' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Куда ушёл трафик' })).toBeInTheDocument();

    await user.click(device);

    expect(device).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('list', { name: 'Показания устройства' })).toBeInTheDocument();
  });
});
