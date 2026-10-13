import { FakePlot } from '@test/fakePlot';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HISTORY_STEP_SECONDS, HISTORY_WINDOW_SECONDS } from '@entities/Connection';
import { MS_IN_SECOND } from '@shared/lib/time';

import { ConnectionHistory } from '../ui/ConnectionHistory';

const NOW = 1_700_000_000 * MS_IN_SECOND;
const PARTIAL_BUFFER = 20;
const HALF_FRAME = MS_IN_SECOND / 2;

function samplesOf(count: number, value = 3) {
  return Array.from({ length: count }, () => value);
}

describe('ConnectionHistory', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'requestAnimationFrame', 'cancelAnimationFrame'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // The axis labels time, not the point number: an incomplete buffer is not stretched
  // over the whole minute, but stands at the right edge with an empty left part.
  it('with an incomplete buffer holds a one-minute window and puts points by their time', () => {
    render(<ConnectionHistory samples={samplesOf(PARTIAL_BUFFER)} sampledAt={NOW} peak={3} />);
    vi.advanceTimersToNextFrame();

    const plot = FakePlot.latest();
    const [times] = plot.data;
    const min = plot.scales.x.min ?? 0;
    const max = plot.scales.x.max ?? 0;

    expect(max - min).toBeCloseTo(HISTORY_WINDOW_SECONDS, 5);
    expect(plot.axisLabels(0)).toEqual(['−45 с', '−30 с', '−15 с', 'сейчас']);
    expect(times.at(-1)).toBe(NOW / MS_IN_SECOND);
    expect(times[0]).toBe(NOW / MS_IN_SECOND - (PARTIAL_BUFFER - 1) * HISTORY_STEP_SECONDS);
    expect(times[0]).toBeGreaterThan(min + HISTORY_WINDOW_SECONDS / 2);
  });

  it('shifts the time axis by frames without recreating the chart', () => {
    render(<ConnectionHistory samples={samplesOf(2)} sampledAt={NOW} peak={3} />);
    vi.advanceTimersToNextFrame();

    const before = FakePlot.latest().scales.x.max ?? 0;

    vi.advanceTimersByTime(HALF_FRAME);
    vi.advanceTimersToNextFrame();

    expect(FakePlot.latest().scales.x.max).toBeGreaterThan(before);
    expect(FakePlot.instances).toHaveLength(1);
  });

  it('takes a round scale edge from the minute peak and does not shrink it on a small dip', () => {
    const { rerender } = render(<ConnectionHistory samples={samplesOf(2, 37)} sampledAt={NOW} peak={37} />);
    const before = FakePlot.latest().scales.y;

    expect(before).toEqual({ min: 0, max: 40 });

    rerender(<ConnectionHistory samples={samplesOf(2, 30)} sampledAt={NOW} peak={30} />);

    expect(FakePlot.latest().scales.y).toEqual(before);
  });

  // Canvas axis labels give no name: the figure names what is visible on it.
  it('names the chart figure by the minute peak', () => {
    render(<ConnectionHistory samples={samplesOf(2, 7)} sampledAt={NOW} peak={7} />);

    expect(screen.getByRole('figure', { name: 'Открытые соединения за минуту, пик 7 соединений' })).toBeInTheDocument();
  });

  it('before the second point shows loading, not an empty axis', () => {
    render(<ConnectionHistory samples={samplesOf(1)} sampledAt={NOW} peak={3} />);

    expect(screen.getByRole('status')).toHaveTextContent('Загружаю');
    expect(FakePlot.instances).toHaveLength(0);
  });
});
