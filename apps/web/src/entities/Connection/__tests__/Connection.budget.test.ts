import { scaledBudget } from '@test/loadFactor';
import { beforeAll, describe, expect, it } from 'vitest';

import { ConnectionsSnapshotSchema } from '../api/Connection.schema';
import { ConnectionStore } from '../model/Connection.store';
import { makeConnectionsSnapshot } from './Connection.fixture';

/** Load ceiling: this many connections the panel must hold. */
const SNAPSHOT_SIZE = 5000;
const RUNS = 5;

/**
 * Measured 2026-09-12 on a MacBook (jsdom, Vitest 4): snapshot parse is 0.6 ms,
 * parse together with row building is 11.8 ms at a 500 ms throttle.
 *
 * Thresholds are set for an idle machine and multiplied by `loadFactor` taken in the same run:
 * under neighbor load the same 11.8 ms turned into 40+, and a fixed threshold failed there.
 * The test catches a several-fold slowdown, not a micro-regression.
 */
const PARSE_BUDGET_MS = 10;
const APPLY_BUDGET_MS = 120;

/** Best of the runs: noise only slows a measurement down, the lower bound is the own cost. */
function fastest(values: number[]): number {
  return Math.min(...values);
}

describe('connections snapshot budget', () => {
  const snapshot = makeConnectionsSnapshot(SNAPSHOT_SIZE);

  beforeAll(() => {
    // The first parse is tens of times costlier than steady state: zod builds the schema
    // on the first call. In production it is the one frame out of thousands, and the threshold
    // is set by the rest.
    ConnectionsSnapshotSchema.safeParse(snapshot);
    ConnectionStore.getState().apply(snapshot);
    ConnectionStore.getState().reset();
  });

  it('parses a snapshot of 5000 connections within the budget', () => {
    const runs: number[] = [];

    for (let run = 0; run < RUNS; run += 1) {
      const start = performance.now();

      ConnectionsSnapshotSchema.safeParse(snapshot);
      runs.push(performance.now() - start);
    }

    expect(fastest(runs)).toBeLessThan(scaledBudget(PARSE_BUDGET_MS));
  });

  it('applies a cold snapshot within the budget', () => {
    const runs: number[] = [];

    for (let run = 0; run < RUNS; run += 1) {
      // Cold snapshot: empty index, the `kept` branch never fires,
      // and all 5000 rows are built: in steady state there is less work.
      ConnectionStore.getState().reset();

      const start = performance.now();

      ConnectionStore.getState().apply(snapshot);
      runs.push(performance.now() - start);
    }

    expect(ConnectionStore.getState().active).toHaveLength(SNAPSHOT_SIZE);
    expect(fastest(runs)).toBeLessThan(scaledBudget(APPLY_BUDGET_MS));
  });
});
