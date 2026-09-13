import { fakeEventSource } from '@test/fakeEventSource';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RUNTIME_TOPIC } from '@shared/api';

import { listenConnections } from '../api/Connection.api';
import type { ConnectionWire } from '../api/Connection.schema';
import { toConnectionRow } from '../model/Connection.adapter';
import { CLOSED_LIMIT, FINAL_OUTCOME } from '../model/Connection.model';
import { ConnectionStore } from '../model/Connection.store';
import { makeConnectionsSnapshot } from './Connection.fixture';

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

  it('исход по умолчанию показывает узлом конфига, а не пустой строкой', () => {
    const row = toConnectionRow({ ...base, rule: '', action: '', final: true }, NO_RATE);

    expect(row.rule).toBe('');
    expect(row.outcome).toBe(FINAL_OUTCOME);
  });

  it('правило без условий исходом по умолчанию не считает', () => {
    const row = toConnectionRow({ ...base, rule: '', action: 'route(direct)', final: false }, NO_RATE);

    expect(row.outcome).toBe('route(direct)');
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
