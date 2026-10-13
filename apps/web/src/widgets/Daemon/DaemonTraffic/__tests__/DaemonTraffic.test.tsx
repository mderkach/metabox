import { FakePlot } from '@test/fakePlot';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TRAFFIC_STEP_SECONDS, TRAFFIC_WINDOW_SECONDS } from '@entities/Daemon';
import { MS_IN_SECOND } from '@shared/lib/time';

import { DaemonTraffic } from '../ui/DaemonTraffic';

const NOW = 1_700_000_000 * MS_IN_SECOND;
const PARTIAL_BUFFER = 20;
const HALF_FRAME = MS_IN_SECOND / 2;
const MIB = 1024 * 1024;

function samplesOf(count: number) {
  return Array.from({ length: count }, () => ({ down: 10, up: 10 }));
}

describe('DaemonTraffic', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'requestAnimationFrame', 'cancelAnimationFrame'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('draws both halves from one edge, even when peaks differ a hundredfold', () => {
    render(<DaemonTraffic samples={samplesOf(2)} sampledAt={NOW} peakDown={5 * MIB} peakUp={50 * 1024} />);

    const { y } = FakePlot.latest().scales;

    expect(y).toEqual({ min: -5 * MIB, max: 5 * MIB });
  });

  it('takes the scale from the minute peak on the screen', () => {
    render(<DaemonTraffic samples={samplesOf(2)} sampledAt={NOW} peakDown={3 * MIB} peakUp={1000} />);

    expect(FakePlot.latest().scales.y.max).toBe(4 * MIB);
  });

  it('shrinks the scale only when the minute peak dropped fourfold', () => {
    const { rerender } = render(
      <DaemonTraffic samples={samplesOf(2)} sampledAt={NOW} peakDown={3 * MIB} peakUp={1000} />
    );

    rerender(<DaemonTraffic samples={samplesOf(2)} sampledAt={NOW} peakDown={1.5 * MIB} peakUp={1000} />);

    expect(FakePlot.latest().scales.y.max).toBe(4 * MIB);

    rerender(<DaemonTraffic samples={samplesOf(2)} sampledAt={NOW} peakDown={0.5 * MIB} peakUp={1000} />);

    expect(FakePlot.latest().scales.y.max).toBe(1000 * 1024);
  });

  it('on an idle channel does not shrink the scale below a megabit per second', () => {
    render(<DaemonTraffic samples={samplesOf(2)} sampledAt={NOW} peakDown={300} peakUp={100} />);

    expect(FakePlot.latest().scales.y.max).toBe(200 * 1024);
  });

  it('with an incomplete buffer holds a full-minute window: axis labels stay in place', () => {
    render(<DaemonTraffic samples={samplesOf(PARTIAL_BUFFER)} sampledAt={NOW} peakDown={10} peakUp={10} />);
    vi.advanceTimersToNextFrame();

    const plot = FakePlot.latest();

    expect((plot.scales.x.max ?? 0) - (plot.scales.x.min ?? 0)).toBeCloseTo(TRAFFIC_WINDOW_SECONDS, 5);
    expect(plot.axisLabels(0)).toEqual(['−45 с', '−30 с', '−15 с', 'сейчас']);
  });

  it('shifts the time axis by frames without recreating the chart', () => {
    render(<DaemonTraffic samples={samplesOf(2)} sampledAt={NOW} peakDown={2} peakUp={2} />);
    vi.advanceTimersToNextFrame();

    const before = FakePlot.latest().scales.x.max ?? 0;

    vi.advanceTimersByTime(HALF_FRAME);
    vi.advanceTimersToNextFrame();

    expect(FakePlot.latest().scales.x.max).toBeGreaterThan(before);
    expect(FakePlot.instances).toHaveLength(1);
  });

  it('holds the right edge one step behind "now" so a new point slides in smoothly', () => {
    render(<DaemonTraffic samples={samplesOf(2)} sampledAt={NOW} peakDown={2} peakUp={2} />);
    vi.advanceTimersToNextFrame();

    expect(FakePlot.latest().scales.x.max).toBeCloseTo(Date.now() / MS_IN_SECOND - TRAFFIC_STEP_SECONDS, 1);
  });

  it('does not shrink the scale when the window peak dipped a little', () => {
    const { rerender } = render(<DaemonTraffic samples={samplesOf(2)} sampledAt={NOW} peakDown={3000} peakUp={0} />);
    const before = FakePlot.latest().scales.y.max;

    rerender(<DaemonTraffic samples={samplesOf(2)} sampledAt={NOW} peakDown={1500} peakUp={0} />);

    expect(FakePlot.latest().scales.y.max).toBe(before);
  });

  it('when the system asks not to move the interface puts the axis together with the data, not by frames', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      addEventListener: vi.fn<() => void>(),
      removeEventListener: vi.fn<() => void>(),
    }));

    render(<DaemonTraffic samples={samplesOf(PARTIAL_BUFFER)} sampledAt={NOW} peakDown={10} peakUp={10} />);
    vi.advanceTimersByTime(HALF_FRAME);
    vi.advanceTimersToNextFrame();

    expect(FakePlot.latest().scales.x).toEqual({
      min: NOW / MS_IN_SECOND - TRAFFIC_WINDOW_SECONDS,
      max: NOW / MS_IN_SECOND,
    });

    vi.unstubAllGlobals();
  });

  it('before the second point shows loading, not an empty axis', () => {
    render(<DaemonTraffic samples={samplesOf(1)} sampledAt={NOW} peakDown={10} peakUp={10} />);

    expect(screen.getByRole('status')).toHaveTextContent('Загружаю');
    expect(FakePlot.instances).toHaveLength(0);
  });
});
