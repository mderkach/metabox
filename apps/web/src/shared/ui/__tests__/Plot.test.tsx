import { FakePlot } from '@test/fakePlot';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Plot, type PlotData, type PlotOptions, type PlotTone } from '../Plot';

const OPTIONS: PlotOptions = { series: [{}, {}], axes: [{}, {}] };
const TONES: readonly PlotTone[] = [{ token: '--primary', fillAlpha: 0.2 }];

describe('Plot', () => {
  it('на новых данных обновляет график, а не пересоздаёт его', () => {
    const first: PlotData = [
      [1, 2],
      [3, 4],
    ];
    const next: PlotData = [
      [2, 3],
      [4, 5],
    ];
    const { rerender } = render(<Plot options={OPTIONS} tones={TONES} data={first} label='график' />);

    rerender(<Plot options={OPTIONS} tones={TONES} data={next} label='график' />);

    expect(FakePlot.instances).toHaveLength(1);
    expect(FakePlot.latest().setData).toHaveBeenLastCalledWith(next, false);
  });

  it('ставит шкалы поверх данных при каждом обновлении', () => {
    const { rerender } = render(
      <Plot options={OPTIONS} tones={TONES} data={[[1], [1]]} scales={{ y: { min: -4, max: 4 } }} label='график' />
    );

    rerender(
      <Plot options={OPTIONS} tones={TONES} data={[[2], [2]]} scales={{ y: { min: -8, max: 8 } }} label='график' />
    );

    expect(FakePlot.latest().scales.y).toEqual({ min: -8, max: 8 });
  });

  it('уничтожает график при размонтировании', () => {
    const { unmount } = render(<Plot options={OPTIONS} tones={TONES} data={[[1], [1]]} label='график' />);
    const plot = FakePlot.latest();

    unmount();

    expect(plot.destroy).toHaveBeenCalledOnce();
  });

  it('читается фигурой с явно заданным доступным именем', () => {
    render(<Plot options={OPTIONS} tones={TONES} data={[[1], [1]]} label='трафик' />);

    expect(screen.getByRole('figure', { name: 'трафик' })).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
