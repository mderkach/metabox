import { describe, expect, it } from 'vitest';

import { ConnectionsSnapshotSchema } from '../api/Connection.schema';
import { ConnectionStore } from '../model/Connection.store';
import { makeConnectionsSnapshot } from './Connection.fixture';

/** Потолок NFR-2: столько соединений панель обязана держать. */
const SNAPSHOT_SIZE = 5000;
const RUNS = 5;

/**
 * Замер 2026-09-12 на MacBook (jsdom, Vitest 4): разбор снапшота — 0.6 мс,
 * разбор вместе с построением строк — 11.8 мс при дросселе в 500 мс.
 *
 * Порог разбора плотный: он сторожит саму валидацию, и её удорожание в разы
 * должно быть видно. Порог применения втрое шире замера — он переживает
 * медленный раннер CI, но ловит регрессию на порядок.
 */
const PARSE_BUDGET_MS = 3;
const APPLY_BUDGET_MS = 40;

function median(values: number[]): number {
  return [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)];
}

describe('бюджет снапшота соединений', () => {
  const snapshot = makeConnectionsSnapshot(SNAPSHOT_SIZE);

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
