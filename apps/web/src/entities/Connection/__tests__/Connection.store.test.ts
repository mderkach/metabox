import { fakeSocket } from '@test/fakeSocket';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { listenConnections } from '../api/Connection.api';
import { splitRule } from '../model/Connection.mapper';
import { CLOSED_LIMIT } from '../model/Connection.model';
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
    const { socket, send } = fakeSocket();
    const unsubscribe = listenConnections(socket);
    const applied = vi.fn<() => void>();
    const stop = ConnectionStore.subscribe(applied);

    send(makeConnectionsSnapshot(3));
    send(makeConnectionsSnapshot(4));
    send(makeConnectionsSnapshot(5));

    expect(applied).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(600);

    expect(applied).toHaveBeenCalledTimes(1);
    expect(ConnectionStore.getState().active).toHaveLength(5);

    stop();
    unsubscribe();
  });

  it('снимает обработчик и таймер при отписке', async () => {
    const fake = fakeSocket();
    const unsubscribe = listenConnections(fake.socket);

    expect(fake.count).toBe(1);

    unsubscribe();

    expect(fake.count).toBe(0);

    fake.send(makeConnectionsSnapshot(2));
    await vi.advanceTimersByTimeAsync(600);

    expect(ConnectionStore.getState().active).toHaveLength(0);
  });

  it('переносит пропавшие между снапшотами соединения в закрытые', async () => {
    const { socket, send } = fakeSocket();
    const unsubscribe = listenConnections(socket);

    send(makeConnectionsSnapshot(4));
    await vi.advanceTimersByTimeAsync(600);
    send(makeConnectionsSnapshot(2));
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
    const { socket, send } = fakeSocket();
    const unsubscribe = listenConnections(socket);

    ConnectionStore.getState().setPaused(true);
    send(makeConnectionsSnapshot(3));
    await vi.advanceTimersByTimeAsync(600);

    expect(ConnectionStore.getState().active).toHaveLength(0);

    unsubscribe();
  });

  it('оборванный кадр пропускается, следующий снапшот применяется', async () => {
    const { socket, send, sendRaw } = fakeSocket();
    const unsubscribe = listenConnections(socket);

    sendRaw('{"connections":[{"id":"a"');
    await vi.advanceTimersByTimeAsync(600);

    expect(ConnectionStore.getState().active).toHaveLength(0);

    send(makeConnectionsSnapshot(2));
    await vi.advanceTimersByTimeAsync(600);

    expect(ConnectionStore.getState().active).toHaveLength(2);

    unsubscribe();
  });

  it('держит снапшот на 5000 соединений одним применением', async () => {
    const { socket, send } = fakeSocket();
    const unsubscribe = listenConnections(socket);
    const applied = vi.fn<() => void>();
    const stop = ConnectionStore.subscribe(applied);

    send(makeConnectionsSnapshot(5000));
    await vi.advanceTimersByTimeAsync(600);

    expect(applied).toHaveBeenCalledTimes(1);
    expect(ConnectionStore.getState().active).toHaveLength(5000);

    stop();
    unsubscribe();
  });
});

describe('splitRule', () => {
  it('разводит условия и исход правила', () => {
    expect(splitRule('rule_set=github => route(proxy)')).toEqual({
      rule: 'rule_set=github',
      outcome: 'route(proxy)',
    });
  });

  it('у правила без условий левая часть пуста', () => {
    expect(splitRule(' => route(direct)')).toEqual({ rule: '', outcome: 'route(direct)' });
  });

  it('строку без разделителя считает исходом целиком', () => {
    expect(splitRule('sniff')).toEqual({ rule: '', outcome: 'sniff' });
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
      connections: snapshot.connections.map((connection, index) =>
        index === 0 ? { ...connection, download: connection.download + 1 } : connection
      ),
    });

    expect(ConnectionStore.getState().active[0]).not.toBe(before);
  });
});
