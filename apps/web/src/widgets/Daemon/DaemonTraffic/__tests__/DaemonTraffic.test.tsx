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

  it('рисует обе половины от одной кромки, даже когда пики различаются в сотню раз', () => {
    render(<DaemonTraffic samples={samplesOf(2)} sampledAt={NOW} peakDown={5 * MIB} peakUp={50 * 1024} />);

    const { y } = FakePlot.latest().scales;

    expect(y).toEqual({ min: -5 * MIB, max: 5 * MIB });
  });

  it('берёт шкалу от пика истории демона, а не от минуты на экране', () => {
    render(
      <DaemonTraffic samples={samplesOf(2)} sampledAt={NOW} peakDown={2000} peakUp={1000} historyPeak={5 * MIB} />
    );

    expect(FakePlot.latest().scales.y.max).toBe(5 * MIB);
  });

  it('на простаивающем канале не сжимает шкалу ниже мегабайта в секунду', () => {
    render(<DaemonTraffic samples={samplesOf(2)} sampledAt={NOW} peakDown={300} peakUp={100} />);

    expect(FakePlot.latest().scales.y.max).toBe(MIB);
  });

  it('при неполном буфере держит окно в полную минуту: подписи оси стоят на месте', () => {
    render(<DaemonTraffic samples={samplesOf(PARTIAL_BUFFER)} sampledAt={NOW} peakDown={10} peakUp={10} />);
    vi.advanceTimersToNextFrame();

    const plot = FakePlot.latest();

    expect((plot.scales.x.max ?? 0) - (plot.scales.x.min ?? 0)).toBeCloseTo(TRAFFIC_WINDOW_SECONDS, 5);
    expect(plot.axisLabels(0)).toEqual(['−45 с', '−30 с', '−15 с', 'сейчас']);
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

  it('держит правую кромку на шаг позади «сейчас», чтобы новая точка въезжала плавно', () => {
    render(<DaemonTraffic samples={samplesOf(2)} sampledAt={NOW} peakDown={2} peakUp={2} />);
    vi.advanceTimersToNextFrame();

    expect(FakePlot.latest().scales.x.max).toBeCloseTo(Date.now() / MS_IN_SECOND - TRAFFIC_STEP_SECONDS, 1);
  });

  it('не сжимает шкалу, когда пик окна немного спал', () => {
    const { rerender } = render(<DaemonTraffic samples={samplesOf(2)} sampledAt={NOW} peakDown={3000} peakUp={0} />);
    const before = FakePlot.latest().scales.y.max;

    rerender(<DaemonTraffic samples={samplesOf(2)} sampledAt={NOW} peakDown={1500} peakUp={0} />);

    expect(FakePlot.latest().scales.y.max).toBe(before);
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
      min: NOW / MS_IN_SECOND - TRAFFIC_WINDOW_SECONDS,
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
