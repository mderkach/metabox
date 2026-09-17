import { renderWithRouter } from '@test/renderWithRouter';
import { server } from '@test/server';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { ConnectionStore } from '@entities/Connection';
import { CONNECTIONS_FIXTURE, makeConnectionsSnapshot } from '@entities/Connection/__tests__/Connection.fixture';
import { DAEMON_ENDPOINT, RuntimeStore, SCHEMA_VERSION } from '@entities/Daemon';
import {
  CLASH_CONFIGS_FIXTURE,
  DAEMON_STATUS_FIXTURE,
  SERVICE_RUNNING_FIXTURE,
  SYSTEM_FIXTURE,
  TRAFFIC_HISTORY_FIXTURE,
} from '@entities/Daemon/__tests__/Daemon.fixture';
import { PROXY_ENDPOINT } from '@entities/Proxy';

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
    // Карточка службы и вердикт в шапке читают одно и то же состояние: без
    // мока экран показал бы «состояние не прочитано» вместо данных.
    http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(SERVICE_RUNNING_FIXTURE)),
    http.get(PROXY_ENDPOINT.proxies(), () => HttpResponse.json({ proxies: {} })),
    http.get(DAEMON_ENDPOINT.history(), () => HttpResponse.json(TRAFFIC_HISTORY_FIXTURE))
  );
}

describe('экран обзора', () => {
  beforeEach(() => {
    ConnectionStore.getState().reset();
    RuntimeStore.getState().reset();
    serveStatus();
  });

  it('показывает скорость из потока, а не накопительный счётчик', async () => {
    RuntimeStore.getState().pushTraffic({ up: 8500, down: 43_400 });

    renderWithRouter(OverviewPage);

    const tiles = within(await screen.findByRole('list', { name: 'Скорость' }));

    expect(tiles.getByText('42.4 кБ/с')).toBeInTheDocument();
    expect(tiles.getByText('8.3 кБ/с')).toBeInTheDocument();
  });

  // Первый сэмпл потока нулевой (PRD, OQ-5): показывать «0 Б» значило бы
  // соврать, что процессу не нужно памяти.
  it('нулевой сэмпл памяти строкой не показывает', async () => {
    RuntimeStore.getState().pushMemory({ inuse: 0, oslimit: 0 });

    renderWithRouter(OverviewPage);

    expect(await screen.findByText('sing-box')).toBeInTheDocument();
    expect(screen.queryByText('Память Go')).not.toBeInTheDocument();
  });

  it('показывает память Go, когда пришёл непустой сэмпл', async () => {
    RuntimeStore.getState().pushMemory({ inuse: 51_380_224, oslimit: 0 });

    renderWithRouter(OverviewPage);

    expect(await screen.findByText('49.0 МБ')).toBeInTheDocument();
  });

  it('считает соединения по снапшоту потока', async () => {
    ConnectionStore.getState().apply(makeConnectionsSnapshot(7));

    renderWithRouter(OverviewPage);

    const counters = within(await screen.findByRole('list', { name: 'Счётчики соединений' }));

    expect(counters.getByText('7')).toBeInTheDocument();
  });

  it('подписывает обе оси графика значениями, которых достигает каждый ряд', async () => {
    RuntimeStore.getState().pushTraffic({ up: 1000, down: 100_000 });

    renderWithRouter(OverviewPage);

    expect(
      await screen.findByRole('img', { name: 'Трафик за минуту: входящий до 97.7 кБ/с, исходящий до 1000 Б/с' })
    ).toBeInTheDocument();
  });

  it('показывает сводку живого снапшота: исход маршрута, типы сети и топ устройств', async () => {
    ConnectionStore.getState().apply(CONNECTIONS_FIXTURE);

    renderWithRouter(OverviewPage);

    expect(await screen.findByText('Куда уходит трафик')).toBeInTheDocument();
    expect(screen.getByText('через прокси')).toBeInTheDocument();
    expect(screen.getByText('TCP')).toBeInTheDocument();
    expect(screen.getByText('192.168.1.60')).toBeInTheDocument();
  });

  // UX-8: признак стоит один раз на секцию, а не на каждой карточке — иначе он
  // перестаёт различать наблюдённое и вычисленное.
  it('помечает сводку как счёт панели один раз на секцию', async () => {
    ConnectionStore.getState().apply(CONNECTIONS_FIXTURE);

    renderWithRouter(OverviewPage);

    expect(await screen.findAllByText('сводку считает панель')).toHaveLength(1);
  });

  it('показывает показания устройства отдельной секцией', async () => {
    RuntimeStore.getState().pushSystem({
      ...SYSTEM_FIXTURE,
      thermal: [{ name: 'cpu-thermal', celsius: 42.5 }],
    });

    renderWithRouter(OverviewPage);

    const cells = within(await screen.findByRole('list', { name: 'Показания устройства' }));

    expect(cells.getByText('42.5 °C')).toBeInTheDocument();
    expect(cells.getByText('0.49')).toBeInTheDocument();
  });

  it('без второго снимка потока график соединений не рисует линию', async () => {
    renderWithRouter(OverviewPage);

    expect(await screen.findByText('Ждём второй снимок потока')).toBeInTheDocument();
  });

  // Вердикт отвечает на вопрос, ради которого экран открывают, и стоит в шапке.
  it('до первых данных рантайма говорит, что ждёт их', async () => {
    renderWithRouter(OverviewPage);

    expect(await screen.findByText('ждём первые данные рантайма')).toBeInTheDocument();
  });

  it('показывает доступность демона и живость потока', async () => {
    renderWithRouter(OverviewPage);

    expect(await screen.findByText('демон отвечает')).toBeInTheDocument();
    expect(screen.getByText('поток молчит')).toBeInTheDocument();
  });

  it('показывает режим Clash API: с ним сверяется правило clash_mode в конфиге', async () => {
    renderWithRouter(OverviewPage);

    expect(await screen.findByText('Rule')).toBeInTheDocument();
  });

  it('путь конфига берётся у демона: он задаётся флагами запуска, а не панелью', async () => {
    serveStatus('/srv/sing-box/router.json');

    renderWithRouter(OverviewPage);

    expect(await screen.findByText('/srv/sing-box/router.json')).toBeInTheDocument();
  });

  it('демон без этого поля не оставляет экран без пути', async () => {
    renderWithRouter(OverviewPage);

    expect(await screen.findByText('/etc/sing-box/config.json')).toBeInTheDocument();
  });

  it('на совпадающей версии предупреждения нет', async () => {
    renderWithRouter(OverviewPage);

    expect(await screen.findByText('демон отвечает')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
