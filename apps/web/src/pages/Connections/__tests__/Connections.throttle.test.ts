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

describe('частота обновления показанных строк', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('при обновлении раз в секунду отдаёт свежий набор без задержки', () => {
    const { result, rerender } = renderHook(({ rows }) => useThrottledRows(rows, REFRESH_INTERVAL.Live), {
      initialProps: { rows: makeRows(2) },
    });

    expect(result.current).toHaveLength(2);

    rerender({ rows: makeRows(3) });

    expect(result.current).toHaveLength(3);
  });

  it('при пяти секундах держит прежний набор до конца периода', async () => {
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

  it('смена интервала показывает накопленный набор сразу, а не в конце нового периода', () => {
    const { result, rerender } = renderHook<ConnectionRow[], { rows: ConnectionRow[]; interval: RefreshInterval }>(
      ({ rows, interval }) => useThrottledRows(rows, interval),
      { initialProps: { rows: makeRows(2), interval: REFRESH_INTERVAL.Slow } }
    );

    rerender({ rows: makeRows(3), interval: REFRESH_INTERVAL.Slow });

    expect(result.current).toHaveLength(2);

    rerender({ rows: makeRows(3), interval: REFRESH_INTERVAL.Slower });

    expect(result.current).toHaveLength(3);
  });

  it('переход на обновление раз в секунду отдаёт накопленный набор без задержки', () => {
    const { result, rerender } = renderHook<ConnectionRow[], { rows: ConnectionRow[]; interval: RefreshInterval }>(
      ({ rows, interval }) => useThrottledRows(rows, interval),
      { initialProps: { rows: makeRows(2), interval: REFRESH_INTERVAL.Slow } }
    );

    rerender({ rows: makeRows(3), interval: REFRESH_INTERVAL.Slow });

    expect(result.current).toHaveLength(2);

    rerender({ rows: makeRows(3), interval: REFRESH_INTERVAL.Live });

    expect(result.current).toHaveLength(3);
  });

  it('снимает таймер при размонтировании', async () => {
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
