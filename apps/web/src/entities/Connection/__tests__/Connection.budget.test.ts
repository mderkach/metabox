import { beforeAll, describe, expect, it } from 'vitest';

import { ConnectionsSnapshotSchema } from '../api/Connection.schema';
import { ConnectionStore } from '../model/Connection.store';
import { makeConnectionsSnapshot } from './Connection.fixture';

/** Потолок нагрузки: столько соединений панель обязана держать. */
const SNAPSHOT_SIZE = 5000;
const RUNS = 5;

/**
 * Замер 2026-09-12 на MacBook (jsdom, Vitest 4): разбор снапшота — 0.6 мс,
 * разбор вместе с построением строк — 11.8 мс при дросселе в 500 мс.
 *
 * Пороги на порядок выше замера: файлы тестов идут параллельно, и под нагрузкой
 * соседей те же 11.8 мс превращались в 40+. Сторожить микрорегрессию в таком
 * окружении нечем — тест ловит подорожание в разы, которого и опасались.
 */
const PARSE_BUDGET_MS = 10;
const APPLY_BUDGET_MS = 120;

function median(values: number[]): number {
  return [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)];
}

describe('бюджет снапшота соединений', () => {
  const snapshot = makeConnectionsSnapshot(SNAPSHOT_SIZE);

  beforeAll(() => {
    // Первый разбор дороже установившегося в десятки раз: zod собирает схему
    // при первом вызове. В работе это единственный кадр из тысяч, и порог
    // ставится по остальным.
    ConnectionsSnapshotSchema.safeParse(snapshot);
    ConnectionStore.getState().apply(snapshot);
    ConnectionStore.getState().reset();
  });

  it('разбирает снапшот на 5000 соединений в пределах бюджета', () => {
    const runs: number[] = [];

    for (let run = 0; run < RUNS; run += 1) {
      const start = performance.now();

      ConnectionsSnapshotSchema.safeParse(snapshot);
      runs.push(performance.now() - start);
    }

    expect(median(runs)).toBeLessThan(PARSE_BUDGET_MS);
  });

  it('применяет холодный снапшот в пределах бюджета', () => {
    const runs: number[] = [];

    for (let run = 0; run < RUNS; run += 1) {
      // Холодный снапшот: пустой индекс, ветка `kept` не срабатывает ни разу,
      // и строки собираются все 5000 — в установившемся режиме работы меньше.
      ConnectionStore.getState().reset();

      const start = performance.now();

      ConnectionStore.getState().apply(snapshot);
      runs.push(performance.now() - start);
    }

    expect(ConnectionStore.getState().active).toHaveLength(SNAPSHOT_SIZE);
    expect(median(runs)).toBeLessThan(APPLY_BUDGET_MS);
  });
});
