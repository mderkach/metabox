import { renderWithRouter } from '@test/renderWithRouter';
import { server } from '@test/server';
import { mockVirtualSizes } from '@test/virtualSizes';
import { act, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CONFIG_ENDPOINT } from '@entities/Config';
import { CONFIG_FIXTURE } from '@entities/Config/__tests__/Config.fixture';
import { CLOSED_LIMIT, ConnectionStore, parseConnectionSearch } from '@entities/Connection';
import { advanceConnectionsSnapshot, makeConnectionsSnapshot } from '@entities/Connection/__tests__/Connection.fixture';
import { MS_IN_SECOND } from '@shared/lib/time';

import { ConnectionsPage } from '../ui/ConnectionsPage';

/** Load ceiling: this many connections the panel must hold (NFR-2). */
const SNAPSHOT_SIZE = 5000;
/** The first ticks cost more than the rest: JIT warm-up and the first virtualizer measurement. */
const WARMUP = 3;
const RUNS = 10;
/**
 * A screen of five thousand rows and a dozen and a half ticks: under the load of neighboring
 * files the test does not fit in the Vitest default five seconds.
 */
const TEST_TIMEOUT_MS = 30 * MS_IN_SECOND;

/**
 * A snapshot tick on the connections screen: parsing a frame of 5000 connections and rendering
 * the screen with the "Active" tab open, while the hidden "Closed" one holds the full
 * row limit.
 *
 * Measured 2026-10-04, Node 24.21.0, jsdom, four vCPUs under the load of neighboring
 * processes, 120 ticks per variant, runs interleaved:
 *
 * - before the screen rework: 75.6 ms median, 48.6 ms best tick when the hidden
 *   tab renders its table, toolbar and footer; 60.8 and 38.2 ms when its
 *   table is not rendered at all. The hidden tab cost about 15 ms, a fifth
 *   of the tick;
 * - after: 71.6 and 40.6 ms when the hidden tab gets a frozen set, against
 *   78.0 and 46.1 ms on the same markup with a live set and without `memo` on the body.
 *
 * jsdom is slower than a browser, and the absolute numbers cannot be carried over: the share of
 * the hidden tab in the tick does carry over. There is no browser profile of this measurement.
 *
 * The threshold has a margin of several times, like the table budget: test files run
 * in parallel, and neighbors take the CPU. The test catches a several-fold slowdown:
 * rendering all rows bypassing the virtualizer or redrawing the hidden tab
 * as a whole, not a micro-regression.
 */
const TICK_BUDGET_MS = 250;

/** Best of the runs: noise only slows a measurement down, the lower bound is the real cost. */
function fastest(values: number[]): number {
  return Math.min(...values);
}

describe('connections screen budget', () => {
  beforeEach(() => {
    localStorage.clear();
    ConnectionStore.getState().reset();
    mockVirtualSizes();
    server.use(http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(JSON.stringify(CONFIG_FIXTURE))));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it(
    'a snapshot tick of 5000 connections fits the budget while closed ones are hidden',
    async () => {
      // The clock moves by the stream step: consecutive frames are considered by the parser
      // implausibly frequent and it does not compute speeds, and that is its main job.
      let clock = Date.now();

      vi.spyOn(Date, 'now').mockImplementation(() => clock);

      const snapshot = makeConnectionsSnapshot(SNAPSHOT_SIZE, { vary: true });
      let seq = 0;

      function nextFrame() {
        seq += 1;
        clock += MS_IN_SECOND;

        return advanceConnectionsSnapshot(snapshot, seq);
      }

      // Frame turnover moves connections to closed: accumulate them to the limit so that the
      // hidden tab holds as many rows as there are on a router.
      while (ConnectionStore.getState().closed.length < CLOSED_LIMIT) {
        ConnectionStore.getState().apply(nextFrame());
      }

      renderWithRouter(ConnectionsPage, {
        path: '/connections',
        validateSearch: parseConnectionSearch,
        initialEntry: '/connections',
      });

      await screen.findAllByRole('button', { name: /Закрыть соединение/ });

      const runs = Array.from({ length: WARMUP + RUNS }, () => {
        const frame = nextFrame();
        const start = performance.now();

        act(() => {
          ConnectionStore.getState().apply(frame);
        });

        return performance.now() - start;
      });

      expect(ConnectionStore.getState().closed).toHaveLength(CLOSED_LIMIT);
      expect(fastest(runs.slice(WARMUP))).toBeLessThan(TICK_BUDGET_MS);
    },
    TEST_TIMEOUT_MS
  );
});
