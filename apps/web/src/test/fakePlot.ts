import type uPlot from 'uplot';
import { vi } from 'vitest';

type Range = { min?: number; max?: number };

/**
 * Подмена uPlot. Канваса в jsdom нет — `getContext` отдаёт `null`, и настоящий
 * график падает в конструкторе. Подмена запоминает вызовы и умеет посчитать
 * подписи оси теми же функциями, что отдал график.
 */
export class FakePlot {
  static readonly instances: FakePlot[] = [];

  readonly options: uPlot.Options;
  data: uPlot.AlignedData;
  readonly scales: Record<string, Range> = {};
  readonly root = document.createElement('div');
  readonly over = document.createElement('div');

  readonly setData = vi.fn<(data: uPlot.AlignedData, resetScales?: boolean) => void>((data) => {
    this.data = data;
  });

  readonly setScale = vi.fn<(key: string, range: Range) => void>((key, range) => {
    this.scales[key] = range;
  });

  readonly setSize = vi.fn<(size: { width: number; height: number }) => void>();
  readonly redraw = vi.fn<() => void>();
  readonly destroy = vi.fn<() => void>();

  readonly batch = vi.fn<(transaction: () => void) => void>((transaction) => {
    transaction();
  });

  constructor(options: uPlot.Options, data: uPlot.AlignedData, target: HTMLElement) {
    this.options = options;
    this.data = data;
    target.append(this.root);
    FakePlot.instances.push(this);
  }

  /** Подписи делений оси `index` при текущих шкалах. */
  axisLabels(index: number): string[] {
    const axis = this.options.axes?.[index];
    // Подмена изображает только ту часть uPlot, которую читают функции осей: шкалы.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- функции осей типизированы полным uPlot
    const self = this as unknown as uPlot;
    const splits = typeof axis?.splits === 'function' ? axis.splits(self, index, 0, 0, 0, 0) : [];

    return typeof axis?.values === 'function' ? axis.values(self, splits, index, 0, 0).map(String) : [];
  }

  static latest(): FakePlot {
    const plot = FakePlot.instances.at(-1);

    if (plot === undefined) {
      throw new Error('график не создан');
    }

    return plot;
  }

  static reset(): void {
    FakePlot.instances.length = 0;
  }
}
