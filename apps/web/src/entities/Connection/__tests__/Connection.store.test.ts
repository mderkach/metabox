import { fakeEventSource } from '@test/fakeEventSource';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RUNTIME_TOPIC } from '@shared/api';
import { MS_IN_SECOND } from '@shared/lib/time';

import { listenConnections } from '../api/Connection.api';
import type { ConnectionWire } from '../api/Connection.schema';
import { toConnectionRow } from '../model/Connection.adapter';
import { CLOSED_LIMIT, FINAL_ACTION, ROUTE_KIND, TOP_LIMIT, toRouteKind } from '../model/Connection.model';
import {
  ConnectionStore,
  HISTORY_STEP_SECONDS,
  HISTORY_WINDOW_POINTS,
  HISTORY_WINDOW_SECONDS,
  toHistoryTimes,
} from '../model/Connection.store';
import { CONNECTIONS_FIXTURE, makeConnectionsSnapshot } from './Connection.fixture';

describe('поток соединений', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    ConnectionStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('применяет снапшот пачкой по таймеру, а не на каждое сообщение', async () => {
    const { source, send } = fakeEventSource();
    const unsubscribe = listenConnections(source);
    const applied = vi.fn<() => void>();
    const stop = ConnectionStore.subscribe(applied);

    send(RUNTIME_TOPIC.Connections, makeConnectionsSnapshot(3));
    send(RUNTIME_TOPIC.Connections, makeConnectionsSnapshot(4));
    send(RUNTIME_TOPIC.Connections, makeConnectionsSnapshot(5));

    expect(applied).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(600);

    expect(applied).toHaveBeenCalledTimes(1);
    expect(ConnectionStore.getState().active).toHaveLength(5);

    stop();
    unsubscribe();
  });

  it('снимает обработчик и таймер при отписке', async () => {
    const fake = fakeEventSource();
    const unsubscribe = listenConnections(fake.source);

    expect(fake.count()).toBe(1);

    unsubscribe();

    expect(fake.count()).toBe(0);

    fake.send(RUNTIME_TOPIC.Connections, makeConnectionsSnapshot(2));
    await vi.advanceTimersByTimeAsync(600);

    expect(ConnectionStore.getState().active).toHaveLength(0);
  });

  it('переносит пропавшие между снапшотами соединения в закрытые', async () => {
    const { source, send } = fakeEventSource();
    const unsubscribe = listenConnections(source);

    send(RUNTIME_TOPIC.Connections, makeConnectionsSnapshot(4));
    await vi.advanceTimersByTimeAsync(600);
    send(RUNTIME_TOPIC.Connections, makeConnectionsSnapshot(2));
    await vi.advanceTimersByTimeAsync(600);

    expect(ConnectionStore.getState().active).toHaveLength(2);
    expect(ConnectionStore.getState().closed).toHaveLength(2);

    unsubscribe();
  });

  it('не копит закрытые бесконечно', () => {
    const store = ConnectionStore.getState();

    store.apply(makeConnectionsSnapshot(CLOSED_LIMIT + 50));
    store.apply(makeConnectionsSnapshot(0));

    expect(ConnectionStore.getState().closed).toHaveLength(CLOSED_LIMIT);
  });

  it('считает закрытые, вытесненные по лимиту', () => {
    const store = ConnectionStore.getState();

    store.apply(makeConnectionsSnapshot(CLOSED_LIMIT - 10));
    store.apply(makeConnectionsSnapshot(0));

    expect(ConnectionStore.getState().evicted).toBe(0);

    store.apply(makeConnectionsSnapshot(30));
    store.apply(makeConnectionsSnapshot(0));

    // Закрылось 220: в списке остаются 200, ещё 20 вытеснено.
    expect(ConnectionStore.getState().closed).toHaveLength(CLOSED_LIMIT);
    expect(ConnectionStore.getState().evicted).toBe(20);

    store.reset();

    expect(ConnectionStore.getState().evicted).toBe(0);
  });

  it('на паузе снапшот не применяется', async () => {
    const { source, send } = fakeEventSource();
    const unsubscribe = listenConnections(source);

    ConnectionStore.getState().setPaused(true);
    send(RUNTIME_TOPIC.Connections, makeConnectionsSnapshot(3));
    await vi.advanceTimersByTimeAsync(600);

    expect(ConnectionStore.getState().active).toHaveLength(0);

    unsubscribe();
  });

  it('оборванный кадр пропускается, следующий снапшот применяется', async () => {
    const { source, send, sendRaw } = fakeEventSource();
    const unsubscribe = listenConnections(source);

    sendRaw(RUNTIME_TOPIC.Connections, '{"topic":"connections","seq":1,"data":{"connections":[{"id":"a"');
    await vi.advanceTimersByTimeAsync(600);

    expect(ConnectionStore.getState().active).toHaveLength(0);

    send(RUNTIME_TOPIC.Connections, makeConnectionsSnapshot(2));
    await vi.advanceTimersByTimeAsync(600);

    expect(ConnectionStore.getState().active).toHaveLength(2);

    unsubscribe();
  });

  it('держит снапшот на 5000 соединений одним применением', async () => {
    const { source, send } = fakeEventSource();
    const unsubscribe = listenConnections(source);
    const applied = vi.fn<() => void>();
    const stop = ConnectionStore.subscribe(applied);

    send(RUNTIME_TOPIC.Connections, makeConnectionsSnapshot(5000));
    await vi.advanceTimersByTimeAsync(600);

    expect(applied).toHaveBeenCalledTimes(1);
    expect(ConnectionStore.getState().active).toHaveLength(5000);

    stop();
    unsubscribe();
  });
});

describe('идентичность строк между снапшотами', () => {
  it('неизменившееся соединение остаётся тем же объектом: иначе memo на строке бесполезен', () => {
    const store = ConnectionStore.getState();
    const snapshot = makeConnectionsSnapshot(3);

    store.apply(snapshot);

    const before = ConnectionStore.getState().active[0];

    store.apply(snapshot);

    expect(ConnectionStore.getState().active[0]).toBe(before);
  });

  it('изменившийся трафик даёт новый объект', () => {
    const store = ConnectionStore.getState();
    const snapshot = makeConnectionsSnapshot(2);

    store.apply(snapshot);

    const before = ConnectionStore.getState().active[0];

    store.apply({
      ...snapshot,
      connections: snapshot.connections.map((connection: ConnectionWire, index: number) =>
        index === 0 ? { ...connection, download: connection.download + 1 } : connection
      ),
    });

    expect(ConnectionStore.getState().active[0]).not.toBe(before);
  });
});

describe('строка соединения', () => {
  const base = makeConnectionsSnapshot(1).connections[0];
  const NO_RATE = { down: 0, up: 0 };

  it('выход по умолчанию показывает узлом конфига, а не пустой строкой', () => {
    const row = toConnectionRow({ ...base, rule: '', action: '', final: true }, NO_RATE);

    expect(row.rule).toBe('');
    expect(row.action).toBe(FINAL_ACTION);
  });

  it('правило без условий выходом по умолчанию не считает', () => {
    const row = toConnectionRow({ ...base, rule: '', action: 'route(direct)', final: false }, NO_RATE);

    expect(row.action).toBe('route(direct)');
  });

  it('цепочку переворачивает в порядок чтения человеком', () => {
    const row = toConnectionRow({ ...base, chain: ['hk-01', 'proxy'] }, NO_RATE);

    expect(row.chain).toEqual(['proxy', 'hk-01']);
  });
});

describe('отбраковка снапшота', () => {
  it('считает снапшоты, которые схема не приняла, и не трогает список', () => {
    const store = ConnectionStore.getState();

    store.reset();
    store.apply(makeConnectionsSnapshot(3));
    store.apply({ connections: 'не список', upload_total: 0, download_total: 0, memory: 0 });

    expect(ConnectionStore.getState().dropped).toBe(1);
    expect(ConnectionStore.getState().active).toHaveLength(3);
  });
});

describe('сводка и история снапшота', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('пишет число открытых соединений в буфер, который дальше минуты не копит', () => {
    const store = ConnectionStore.getState();

    store.reset();

    for (let tick = 0; tick < 2 * HISTORY_WINDOW_POINTS; tick += 1) {
      store.apply(makeConnectionsSnapshot(2));
    }

    const { history } = ConnectionStore.getState();

    expect(history.length).toBeGreaterThanOrEqual(HISTORY_WINDOW_POINTS);
    expect(history.length).toBeLessThan(2 * HISTORY_WINDOW_POINTS);
    expect(history.at(-1)).toBe(2);
  });

  it('запоминает, когда пришла последняя точка истории: от неё считается время графика', () => {
    const store = ConnectionStore.getState();

    store.reset();
    vi.setSystemTime(1_000 * MS_IN_SECOND);
    store.apply(makeConnectionsSnapshot(2));

    expect(ConnectionStore.getState().historyAt).toBe(1_000 * MS_IN_SECOND);
  });

  it('засевает пустую историю минутой от демона со временем засева, а заполненную не трогает', () => {
    const store = ConnectionStore.getState();

    store.reset();
    vi.setSystemTime(2_000 * MS_IN_SECOND);
    store.seedHistory([1, 2, 3]);

    expect(ConnectionStore.getState()).toMatchObject({ history: [1, 2, 3], historyAt: 2_000 * MS_IN_SECOND });

    ConnectionStore.getState().seedHistory([9, 9]);

    expect(ConnectionStore.getState().history).toEqual([1, 2, 3]);
  });

  it('считает время точек истории от последней назад с шагом снапшота', () => {
    expect(toHistoryTimes(3, 10 * MS_IN_SECOND)).toEqual([
      10 - 2 * HISTORY_STEP_SECONDS,
      10 - HISTORY_STEP_SECONDS,
      10,
    ]);
  });

  it('полный буфер истории начинается не правее левой кромки окна, даже когда точка только что пришла', () => {
    const store = ConnectionStore.getState();

    store.reset();

    for (let tick = 0; tick < 2 * HISTORY_WINDOW_POINTS; tick += 1) {
      store.apply(makeConnectionsSnapshot(1));
    }

    const arrivedAt = 100 * MS_IN_SECOND;
    const [oldest] = toHistoryTimes(ConnectionStore.getState().history.length, arrivedAt);
    const leftEdge = arrivedAt / MS_IN_SECOND - HISTORY_STEP_SECONDS - HISTORY_WINDOW_SECONDS;

    expect(oldest).toBeLessThanOrEqual(leftEdge);
  });

  it('считает сводку тем же снапшотом, что и список', () => {
    const store = ConnectionStore.getState();

    store.reset();
    store.apply(CONNECTIONS_FIXTURE);

    const { summary, active } = ConnectionStore.getState();
    const counted = summary.actions.reduce((sum, share) => sum + share.count, 0);

    expect(counted).toBe(active.length);
    expect(summary.sources.length).toBeGreaterThan(0);
  });

  it('в узлы сводки берёт конец цепочки и только у маршрута через прокси', () => {
    const store = ConnectionStore.getState();

    store.reset();
    store.apply(CONNECTIONS_FIXTURE);

    const { summary, active } = ConnectionStore.getState();
    const proxied = active.filter((row) => row.action.includes('route(') && !row.action.includes('direct'));

    expect(summary.nodes.map((share) => share.key)).toEqual(
      expect.arrayContaining(proxied.map((row) => row.chain.at(-1)))
    );
    expect(summary.nodes.every((share) => share.key !== 'direct')).toBe(true);
  });

  it('ставит топы узлов и устройств по объёму, а не по скорости: иначе строки менялись бы местами каждую секунду', () => {
    const store = ConnectionStore.getState();

    store.reset();
    store.apply(CONNECTIONS_FIXTURE);

    const { summary } = ConnectionStore.getState();

    for (const top of [summary.nodes, summary.sources]) {
      const volumes = top.map((share) => share.volume);

      expect(volumes).toEqual([...volumes].sort((left, right) => right - left));
    }
  });

  it('считает объём группы суммой байт входящих в неё соединений', () => {
    const store = ConnectionStore.getState();

    store.reset();
    store.apply(CONNECTIONS_FIXTURE);

    const { summary, active } = ConnectionStore.getState();
    const volumeByAction = new Map<string, number>();
    const volumeByNetwork = new Map<string, number>();
    const volumeByNode = new Map<string, number>();
    const volumeBySource = new Map<string, number>();

    for (const row of active) {
      const volume = row.download + row.upload;
      const kind = toRouteKind(row.action, row.chain);

      volumeByAction.set(kind, (volumeByAction.get(kind) ?? 0) + volume);
      volumeByNetwork.set(row.network, (volumeByNetwork.get(row.network) ?? 0) + volume);
      volumeBySource.set(row.source, (volumeBySource.get(row.source) ?? 0) + volume);

      const node = row.chain.at(-1);

      if (node !== undefined && kind === ROUTE_KIND.Proxy) {
        volumeByNode.set(node, (volumeByNode.get(node) ?? 0) + volume);
      }
    }

    for (const share of summary.actions) {
      expect(share.volume).toBe(volumeByAction.get(share.key));
    }

    for (const share of summary.networks) {
      expect(share.volume).toBe(volumeByNetwork.get(share.key));
    }

    for (const share of summary.nodes) {
      expect(share.volume).toBe(volumeByNode.get(share.key));
    }

    for (const share of summary.sources) {
      expect(share.volume).toBe(volumeBySource.get(share.key));
    }
  });

  it('в столбчатой сводке держит только первые группы', () => {
    const store = ConnectionStore.getState();
    const sample = CONNECTIONS_FIXTURE.connections[0];
    const many = Array.from({ length: TOP_LIMIT + 3 }, (_, index) => ({
      ...sample,
      id: `${sample.id}-${String(index)}`,
      source: `192.168.1.${String(index)}`,
    }));

    store.reset();
    store.apply({ ...CONNECTIONS_FIXTURE, connections: many });

    expect(ConnectionStore.getState().summary.sources).toHaveLength(TOP_LIMIT);
  });

  it('сбрасывает сводку и историю вместе со списком', () => {
    const store = ConnectionStore.getState();

    store.apply(CONNECTIONS_FIXTURE);
    ConnectionStore.getState().reset();

    expect(ConnectionStore.getState().history).toEqual([]);
    expect(ConnectionStore.getState().historyAt).toBeNull();
    expect(ConnectionStore.getState().summary.actions).toEqual([]);
  });
});

describe('тон действия по типам аутбаундов', () => {
  const OUTBOUND_TYPES = new Map([
    ['direct', 'shadowsocks'],
    ['proxy', 'urltest'],
    ['us-fallback', 'selector'],
  ]);

  afterEach(() => {
    ConnectionStore.getState().setOutboundTypes(new Map());
    ConnectionStore.getState().reset();
  });

  it('разбирает снапшот по карте: тег `direct` типа `shadowsocks` — прокси', () => {
    const store = ConnectionStore.getState();

    store.reset();
    store.setOutboundTypes(OUTBOUND_TYPES);
    store.apply(CONNECTIONS_FIXTURE);

    const { active } = ConnectionStore.getState();

    expect(active).toHaveLength(CONNECTIONS_FIXTURE.connections.length);
    expect(active.every((row) => row.kind === ROUTE_KIND.Proxy)).toBe(true);
  });

  it('без карты тот же снапшот читает по строке действия', () => {
    const store = ConnectionStore.getState();

    store.reset();
    store.apply(CONNECTIONS_FIXTURE);

    const direct = ConnectionStore.getState().active.filter((row) => row.action === 'route(direct)');

    expect(direct.length).toBeGreaterThan(0);
    expect(direct.every((row) => row.kind === ROUTE_KIND.Direct)).toBe(true);
  });

  it('карта, пришедшая после снапшота, перекрашивает уже разобранные строки', () => {
    const store = ConnectionStore.getState();

    store.reset();
    store.apply(CONNECTIONS_FIXTURE);

    const before = ConnectionStore.getState();
    const untouched = before.active.filter((row) => row.action !== 'route(direct)');

    store.setOutboundTypes(OUTBOUND_TYPES);

    const after = ConnectionStore.getState();
    const direct = after.active.filter((row) => row.action === 'route(direct)');

    expect(direct.length).toBeGreaterThan(0);
    expect(direct.every((row) => row.kind === ROUTE_KIND.Proxy)).toBe(true);
    for (const row of untouched) {
      expect(after.index.get(row.id)).toBe(row);
    }
    expect(after.summary.actions.find((share) => share.key === ROUTE_KIND.Direct)).toBeUndefined();
  });

  it('сброс списка карту не теряет: конфиг перечитывать незачем', () => {
    const store = ConnectionStore.getState();

    store.setOutboundTypes(OUTBOUND_TYPES);
    ConnectionStore.getState().reset();

    expect(ConnectionStore.getState().outboundTypes).toBe(OUTBOUND_TYPES);
  });
});
