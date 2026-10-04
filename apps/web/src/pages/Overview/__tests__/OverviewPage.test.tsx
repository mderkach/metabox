import { renderWithRouter } from '@test/renderWithRouter';
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
  SERVICE_RUNNING_FIXTURE,
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
    // Карточка службы и вердикт в шапке читают одно и то же состояние: без
    // мока экран показал бы «состояние не прочитано» вместо данных.
    http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(SERVICE_RUNNING_FIXTURE)),
    http.get(PROXY_ENDPOINT.proxies(), () => HttpResponse.json({ proxies: {} })),
    http.get(DAEMON_ENDPOINT.history(), () => HttpResponse.json(TRAFFIC_HISTORY_FIXTURE)),
    // Поток соединений читает конфиг ради типов аутбаундов: без мока сводка
    // считалась бы по таблице подстрок, а не по документу.
    http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(MINIMAL_CONFIG))
  );
}

const MINIMAL_CONFIG = JSON.stringify({ outbounds: [{ type: 'direct', tag: 'direct' }] }, null, 2);

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

  // Первый сэмпл потока нулевой: показывать «0 Б» значило бы
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

  it('называет в имени графика трафика пик каждого направления', async () => {
    RuntimeStore.getState().pushTraffic({ up: 500, down: 20_000 });
    RuntimeStore.getState().pushTraffic({ up: 1000, down: 100_000 });

    renderWithRouter(OverviewPage);

    expect(
      await screen.findByRole('figure', { name: 'Трафик за минуту: входящий до 97.7 кБ/с, исходящий до 1000 Б/с' })
    ).toBeInTheDocument();
  });

  it('показывает сводку живого снапшота: выход маршрута, типы сети и топ устройств', async () => {
    ConnectionStore.getState().apply(CONNECTIONS_FIXTURE);

    renderWithRouter(OverviewPage);

    expect(await screen.findByText('Куда уходит трафик')).toBeInTheDocument();
    expect(screen.getByText('через прокси')).toBeInTheDocument();
    expect(screen.getByText('TCP')).toBeInTheDocument();
    expect(screen.getByText('192.168.1.60')).toBeInTheDocument();
  });

  // Признак стоит один раз на секцию, а не на каждой карточке — иначе он
  // перестаёт различать наблюдённое и вычисленное.
  it('помечает сводку как счёт панели один раз на секцию', async () => {
    ConnectionStore.getState().apply(CONNECTIONS_FIXTURE);

    renderWithRouter(OverviewPage);

    expect(await screen.findAllByText('счётчики живут, пока открыта вкладка')).toHaveLength(1);
  });

  it('без живых соединений и выбранных узлов карточки сводки говорят, что данных нет', async () => {
    renderWithRouter(OverviewPage);

    expect(await screen.findAllByText('Живых соединений нет')).not.toHaveLength(0);
    expect(await screen.findByText('Групп с выбранным узлом нет')).toBeInTheDocument();
  });

  // Замер меняет числа на месте: глазами это видно, а скринридеру результат
  // объявляет живая область экрана.
  it('объявляет живой областью, что задержка выбранных узлов обновлена', async () => {
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

  // Утечку и перегрев видно за часы работы, а не за минуту вкладки: ряды
  // берутся из истории демона и называют своё окно и размах.
  it('показывает память sing-box и показания платы рядом за всё окно истории демона', async () => {
    RuntimeStore.getState().pushSystem({ ...SYSTEM_FIXTURE, thermal: [{ name: 'cpu-thermal', celsius: 42.5 }] });

    renderWithRouter(OverviewPage);

    expect(
      await screen.findByRole('img', { name: 'Память процесса sing-box за время работы демона' })
    ).toBeInTheDocument();
    expect(screen.getAllByText(/^за 6 мин · от /)).toHaveLength(5);
  });

  // Панель открывают не всегда: минута трафика копится у демона, и график
  // открывается полным, а не с того момента, как открыта вкладка.
  it('рисует графики трафика и соединений минутой от демона ещё до первого кадра потока', async () => {
    renderWithRouter(OverviewPage);

    expect(await screen.findByRole('figure', { name: /Трафик за минуту/ })).toBeInTheDocument();
    expect(await screen.findByRole('figure', { name: /Открытые соединения за минуту/ })).toBeInTheDocument();
    expect(RuntimeStore.getState().traffic).toHaveLength(60);
    expect(ConnectionStore.getState().history).toHaveLength(60);
  });

  // Вердикт отвечает на вопрос, ради которого экран открывают, и стоит в шапке.
  it('до первых данных рантайма говорит, что ждёт их', async () => {
    renderWithRouter(OverviewPage);

    expect(await screen.findByText('ждём первые данные от sing-box')).toBeInTheDocument();
  });

  it('показывает доступность демона и живость потока', async () => {
    renderWithRouter(OverviewPage);

    expect(await screen.findByText('демон отвечает')).toBeInTheDocument();
    expect(screen.getByText('поток молчит')).toBeInTheDocument();
  });

  it('показывает режим Clash API словами, а не полем ответа: с ним сверяется правило clash_mode в конфиге', async () => {
    renderWithRouter(OverviewPage);

    expect(await screen.findByText('по правилам')).toBeInTheDocument();
    expect(screen.queryByText('Rule')).not.toBeInTheDocument();
  });

  it('переводит и другие значения режима, не только Rule', async () => {
    server.use(
      http.get(DAEMON_ENDPOINT.clashConfigs(), () => HttpResponse.json({ ...CLASH_CONFIGS_FIXTURE, mode: 'Global' }))
    );

    renderWithRouter(OverviewPage);

    expect(await screen.findByText('глобально')).toBeInTheDocument();
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
