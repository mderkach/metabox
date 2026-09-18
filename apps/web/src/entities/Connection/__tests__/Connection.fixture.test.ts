import { describe, expect, it } from 'vitest';

import { advanceConnectionsSnapshot, CONNECTIONS_FIXTURE, makeConnectionsSnapshot } from './Connection.fixture';

/** Кадров за час дев-сессии при шаге потока в секунду — столько и проверяем. */
const FRAMES = 50;
const SNAPSHOT_SIZE = 64;

describe('живые кадры потока соединений', () => {
  it('не даёт провернуть кадр на эталоне: он заморожен', () => {
    expect(() => advanceConnectionsSnapshot(CONNECTIONS_FIXTURE, 1)).toThrow(TypeError);
    expect(CONNECTIONS_FIXTURE.upload_total).toBe(12376739);
  });

  it('наращивает счётчики, а не пересчитывает их по живым соединениям', () => {
    const snapshot = makeConnectionsSnapshot(SNAPSHOT_SIZE, { vary: true });
    const before = { upload: snapshot.upload_total, download: snapshot.download_total };

    advanceConnectionsSnapshot(snapshot, 1);

    expect(snapshot.upload_total).toBeGreaterThan(before.upload);
    expect(snapshot.download_total).toBeGreaterThan(before.download);
  });

  it('держит длину идентификаторов: образец берётся из эталона, а не из прошлого кадра', () => {
    const snapshot = makeConnectionsSnapshot(SNAPSHOT_SIZE, { vary: true });
    const longest = () => Math.max(...snapshot.connections.map((row) => row.id.length));
    const start = longest();

    for (let seq = 1; seq <= FRAMES; seq += 1) {
      advanceConnectionsSnapshot(snapshot, seq);
    }

    // Запас на суффикс кадра: он двузначный, а не растущий с каждым кадром.
    expect(longest()).toBeLessThan(start + 10);
  });

  it('закрывает и открывает соединения, иначе панель не соберёт закрытые', () => {
    const snapshot = makeConnectionsSnapshot(SNAPSHOT_SIZE, { vary: true });
    const before = new Set(snapshot.connections.map((row) => row.id));

    advanceConnectionsSnapshot(snapshot, 1);

    const gone = [...before].filter((id) => !snapshot.connections.some((row) => row.id === id));

    expect(gone.length).toBeGreaterThan(0);
  });
});
