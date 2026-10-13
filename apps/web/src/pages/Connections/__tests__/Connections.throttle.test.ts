import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ROUTE_KIND, type ConnectionRow } from '@entities/Connection';
import { REFRESH_INTERVAL, type RefreshInterval } from '@widgets/ConnectionTable';

import { useThrottledRows } from '../lib';

function makeRows(count: number): ConnectionRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `c${String(index)}`,
    host: 'video.example:443',
    network: 'tcp',
    source: '192.168.1.60',
    rule: '',
    action: 'route(direct)',
    kind: ROUTE_KIND.Direct,
    chain: ['direct'],
    upload: 0,
    download: 0,
    downRate: 0,
    upRate: 0,
    startedAt: 0,
    searchText: '',
  }));
}

describe('shown rows refresh rate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('with a refresh once a second returns the fresh set without delay', () => {
    const { result, rerender } = renderHook(({ rows }) => useThrottledRows(rows, REFRESH_INTERVAL.Live), {
      initialProps: { rows: makeRows(2) },
    });

    expect(result.current).toHaveLength(2);

    rerender({ rows: makeRows(3) });

    expect(result.current).toHaveLength(3);
  });

  it('at five seconds holds the previous set until the end of the period', async () => {
    const { result, rerender } = renderHook(({ rows }) => useThrottledRows(rows, REFRESH_INTERVAL.Slow), {
      initialProps: { rows: makeRows(2) },
    });

    expect(result.current).toHaveLength(2);

    rerender({ rows: makeRows(3) });

    expect(result.current).toHaveLength(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL.Slow);
    });

    expect(result.current).toHaveLength(3);
  });

  it('an interval change shows the accumulated set at once, not at the end of the new period', () => {
    const { result, rerender } = renderHook<ConnectionRow[], { rows: ConnectionRow[]; interval: RefreshInterval }>(
      ({ rows, interval }) => useThrottledRows(rows, interval),
      { initialProps: { rows: makeRows(2), interval: REFRESH_INTERVAL.Slow } }
    );

    rerender({ rows: makeRows(3), interval: REFRESH_INTERVAL.Slow });

    expect(result.current).toHaveLength(2);

    rerender({ rows: makeRows(3), interval: REFRESH_INTERVAL.Slower });

    expect(result.current).toHaveLength(3);
  });

  it('a switch to a refresh once a second returns the accumulated set without delay', () => {
    const { result, rerender } = renderHook<ConnectionRow[], { rows: ConnectionRow[]; interval: RefreshInterval }>(
      ({ rows, interval }) => useThrottledRows(rows, interval),
      { initialProps: { rows: makeRows(2), interval: REFRESH_INTERVAL.Slow } }
    );

    rerender({ rows: makeRows(3), interval: REFRESH_INTERVAL.Slow });

    expect(result.current).toHaveLength(2);

    rerender({ rows: makeRows(3), interval: REFRESH_INTERVAL.Live });

    expect(result.current).toHaveLength(3);
  });

  it('clears the timer on unmount', async () => {
    const { rerender, unmount } = renderHook(({ rows }) => useThrottledRows(rows, REFRESH_INTERVAL.Slow), {
      initialProps: { rows: makeRows(2) },
    });

    rerender({ rows: makeRows(3) });
    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL.Slower);
    });

    expect(vi.getTimerCount()).toBe(0);
  });
});
