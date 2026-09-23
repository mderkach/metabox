import { FakePlot } from '@test/fakePlot';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MS_IN_SECOND } from '@shared/lib/time';

import { DaemonTraffic } from '../ui/DaemonTraffic';

const NOW = 1_700_000_000 * MS_IN_SECOND;
const PARTIAL_BUFFER = 20;
const HALF_FRAME = MS_IN_SECOND / 2;

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

  it('рисует обе половины от одной кромки, даже когда пики различаются в сотню раз', () => {
    render(<DaemonTraffic samples={samplesOf(2)} sampledAt={NOW} peakDown={100_000} peakUp={1000} />);

    const { y } = FakePlot.latest().scales;

    expect(y).toEqual({ min: -102_400, max: 102_400 });
  });

  it('при неполном буфере не подписывает время, за которое данных нет', () => {
    render(<DaemonTraffic samples={samplesOf(PARTIAL_BUFFER)} sampledAt={NOW} peakDown={10} peakUp={10} />);
    vi.advanceTimersToNextFrame();

    const plot = FakePlot.latest();

    expect(plot.scales.x.min).toBe(NOW / MS_IN_SECOND - (PARTIAL_BUFFER - 1));
    expect(plot.axisLabels(0)).toEqual(['−15 с', 'сейчас']);
  });

  it('сдвигает ось времени по кадрам, не пересоздавая график', () => {
    render(<DaemonTraffic samples={samplesOf(2)} sampledAt={NOW} peakDown={2} peakUp={2} />);
    vi.advanceTimersToNextFrame();

    const before = FakePlot.latest().scales.x.max ?? 0;

    vi.advanceTimersByTime(HALF_FRAME);
    vi.advanceTimersToNextFrame();

    expect(FakePlot.latest().scales.x.max).toBeGreaterThan(before);
    expect(FakePlot.instances).toHaveLength(1);
  });

  it('при просьбе системы не двигать интерфейс ставит ось вместе с данными, а не по кадрам', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      addEventListener: vi.fn<() => void>(),
      removeEventListener: vi.fn<() => void>(),
    }));

    render(<DaemonTraffic samples={samplesOf(PARTIAL_BUFFER)} sampledAt={NOW} peakDown={10} peakUp={10} />);
    vi.advanceTimersByTime(HALF_FRAME);
    vi.advanceTimersToNextFrame();

    expect(FakePlot.latest().scales.x).toEqual({
      min: NOW / MS_IN_SECOND - (PARTIAL_BUFFER - 1),
      max: NOW / MS_IN_SECOND,
    });

    vi.unstubAllGlobals();
  });

  it('до второй точки показывает загрузку, а не пустую ось', () => {
    render(<DaemonTraffic samples={samplesOf(1)} sampledAt={NOW} peakDown={10} peakUp={10} />);

    expect(screen.getByRole('status')).toHaveTextContent('Загружаю');
    expect(FakePlot.instances).toHaveLength(0);
  });
});
