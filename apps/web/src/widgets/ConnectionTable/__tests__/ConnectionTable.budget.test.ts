import { sortFn_alphanumeric, sortFn_basic, sortFn_text } from '@tanstack/react-table';
import { scaledBudget } from '@test/loadFactor';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { ConnectionStore, type ConnectionRow } from '@entities/Connection';
import { advanceConnectionsSnapshot, makeConnectionsSnapshot } from '@entities/Connection/__tests__/Connection.fixture';

import { CONNECTION_COLUMNS, CONNECTION_FIELD } from '../ui/ConnectionColumns';

/** Load ceiling: this many connections the panel must hold. */
const SNAPSHOT_SIZE = 5000;
const RUNS = 5;

/**
 * Measured 2026-09-18 in a browser on live mocks: a snapshot once a second, a click on a
 * column is 33-46 ms until the redraw, zero long tasks.
 *
 * The test measures not the library row model but its main cost: taking the key
 * through the column description `accessorFn` and ordering five thousand values.
 * The keys are taken the same as in production, so an expensive `accessorFn` is caught
 * by the test; the library overhead itself is not.
 *
 * The threshold is set for an idle machine and multiplied by `loadFactor` taken in the same run,
 * so neighbor load does not fail it. The test catches a several-fold slowdown, not a micro-regression.
 */
const SORT_BUDGET_MS = 60;

/**
 * Parsing a snapshot with connection turnover: counters grew, some rows
 * are rebuilt, some went to closed.
 *
 * Measured 2026-09-18 in a browser on live frames: 3 ms without throttling, 8.6 ms with
 * a fourfold CPU slowdown. Before the draft was taken out of immer from the stores it was
 * 14.9 and 61.3 ms: almost the whole tick budget went to proxy wrappers.
 * ([ADR-0024](../../../../../../docs/adr/ADR-0024-drop-the-immer-draft-from-frontend-stores.md)).
 *
 * In this environment the parse takes 3.8 ms. The threshold is held below what the
 * wrapper would bring it to: converting browser measurements gives about 19 ms, and with a threshold of
 * tens of milliseconds its return would go unnoticed.
 *
 * More runs than for sorting: the first after a reset costs more than the rest:
 * the index is empty, and none of the five thousand rows is returned as the previous object.
 * A short sample therefore goes up entirely when neighboring test files
 * take the CPU.
 */
const APPLY_BUDGET_MS = 12;
const APPLY_RUNS = 9;

/** Stream step: with it the parse computes speeds, without it it skips them entirely. */
const STREAM_STEP_MS = 500;

function median(values: number[]): number {
  return [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)];
}

/**
 * Best of the runs. The median floats here: test files run in parallel, and
 * neighbors take the CPU at an arbitrary moment, and noise only slows a measurement down
 * so the lower bound is the own cost of the parse.
 */
function fastest(values: number[]): number {
  return Math.min(...values);
}

/** Keys are taken by the same `accessorFn` as in production. */
function sortBy(field: string, rows: readonly ConnectionRow[]): number {
  const def = CONNECTION_COLUMNS.find((column) => column.id === field);

  if (def === undefined) {
    throw new Error(`Колонки ${field} нет в описании таблицы`);
  }

  const keyed = rows.map((row, index) => def.accessorFn(row, index));
  const start = performance.now();

  keyed.sort((left, right) =>
    typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right))
  );

  return performance.now() - start;
}

describe('connection table budget', () => {
  let rows: readonly ConnectionRow[] = [];

  beforeAll(() => {
    ConnectionStore.getState().reset();
    ConnectionStore.getState().apply(makeConnectionsSnapshot(SNAPSHOT_SIZE));
    // A copy, not a reference: the parse measurement below clears the store, and the sort would be left
    // without rows.
    rows = [...ConnectionStore.getState().active];
  });

  it('sorts 5000 rows by a numeric column within the budget', () => {
    const runs = Array.from({ length: RUNS }, () => sortBy(CONNECTION_FIELD.Volume, rows));

    expect(median(runs)).toBeLessThan(scaledBudget(SORT_BUDGET_MS));
  });

  it('sorts 5000 rows by a text column within the budget', () => {
    const runs = Array.from({ length: RUNS }, () => sortBy(CONNECTION_FIELD.Host, rows));

    expect(median(runs)).toBeLessThan(scaledBudget(SORT_BUDGET_MS));
  });

  it('parses a snapshot of 5000 connections within the budget', () => {
    const snapshot = makeConnectionsSnapshot(SNAPSHOT_SIZE, { vary: true });
    // The clock moves by the stream step: consecutive calls are considered by the parser
    // implausibly frequent and it does not compute speeds, and that is the main job.
    let clock = Date.now();
    const now = vi.spyOn(Date, 'now').mockImplementation(() => clock);

    ConnectionStore.getState().reset();

    const runs = Array.from({ length: APPLY_RUNS }, (_, run) => {
      const frame = advanceConnectionsSnapshot(snapshot, run + 1);

      clock += STREAM_STEP_MS;

      const start = performance.now();

      ConnectionStore.getState().apply(frame);

      return performance.now() - start;
    });

    now.mockRestore();

    const state = ConnectionStore.getState();

    expect(state.active).toHaveLength(SNAPSHOT_SIZE);
    // Connection turnover in a frame must reach closed ones, and counters must reach
    // speeds: without both the measurement would bypass the main job of the
    // parse and measure the return of previous rows.
    expect(state.closed.length).toBeGreaterThan(0);
    expect(state.active.some((row) => row.downRate > 0)).toBe(true);
    expect(fastest(runs)).toBeLessThan(scaledBudget(APPLY_BUDGET_MS));
  });

  it('declares a comparison for every column: without it the list silently goes in stream order', () => {
    const registered = { text: sortFn_text, basic: sortFn_basic, alphanumeric: sortFn_alphanumeric };

    for (const def of CONNECTION_COLUMNS) {
      expect(typeof def.sortFn).toBe('string');
      expect(registered).toHaveProperty(String(def.sortFn));
    }
  });
});
