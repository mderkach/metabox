import { describe, expect, it } from 'vitest';

import {
  toSparkCeiling,
  toStickyCeiling,
  BYTE_STEPS,
  toAreaGeometry,
  toMirroredTicks,
  toDonutSegments,
  toPercents,
  toShare,
  toTimeTicks,
  toTimeWindow,
  toValueScale,
} from '../chart';

describe('toSparkCeiling', () => {
  it('с ёмкостью ставит верх на неё, а не на пик ряда', () => {
    expect(toSparkCeiling(386, 7800)).toBe(7800);
  });

  it('ряд, переросший ёмкость, растягивает шкалу до пика', () => {
    expect(toSparkCeiling(6, 4)).toBe(6);
  });

  it('без ёмкости берёт пик с запасом', () => {
    expect(toSparkCeiling(100)).toBeCloseTo(115);
  });
});

describe('toStickyCeiling', () => {
  it('растёт сразу, как только величина переросла кромку', () => {
    expect(toStickyCeiling(2048, 5120)).toBe(5120);
  });

  it('держит кромку, пока величина не упала вчетверо', () => {
    expect(toStickyCeiling(5120, 2048)).toBe(5120);
    expect(toStickyCeiling(5120, 1024)).toBe(1024);
  });
});

describe('toShare', () => {
  it('на нулевой сумме отдаёт ноль, а не NaN', () => {
    expect(toShare(0, 0)).toBe(0);
  });

  it('считает долю от суммы', () => {
    expect(toShare(1, 4)).toBe(0.25);
  });
});

describe('toAreaGeometry', () => {
  it('не строит линию по одной точке', () => {
    expect(toAreaGeometry([5], 10, 100, 100)).toBeNull();
  });

  it('кладёт значение в пик на верх области, а ноль — на низ', () => {
    const geometry = toAreaGeometry([0, 10], 10, 100, 50);

    expect(geometry?.line).toBe('0.00,50.00 100.00,0.00');
  });

  it('замыкает контур по нижней кромке области', () => {
    const geometry = toAreaGeometry([10, 10], 10, 100, 50);

    expect(geometry?.area).toBe('M0,50 L0.00,0.00 L100.00,0.00 L100,50 Z');
  });
});

describe('toPercents', () => {
  it('раздаёт остаток так, что доли складываются в сто', () => {
    expect(toPercents([7, 1])).toEqual([88, 12]);
  });

  it('держит сумму в ста и на трёх долях', () => {
    const percents = toPercents([1, 1, 1]);

    expect(percents.reduce((sum, value) => sum + value, 0)).toBe(100);
  });

  it('на пустых данных отдаёт нули, а не NaN', () => {
    expect(toPercents([0, 0])).toEqual([0, 0]);
  });
});

describe('toDonutSegments', () => {
  it('ставит каждый сегмент за предыдущим', () => {
    const segments = toDonutSegments([1, 1], 100);

    expect(segments.map((segment) => segment.turn)).toEqual([0, 180]);
    expect(segments[0].dash).toBe('50.00 100.00');
  });
});

describe('toValueScale', () => {
  it('берёт наименьший шаг, при котором максимум укладывается в деления', () => {
    expect(toValueScale(700, [100, 200, 500])).toEqual({ ceiling: 800, ticks: [0, 200, 400, 600, 800] });
  });

  it('на нулевом максимуме строит шкалу в один шаг, а не вырожденную', () => {
    expect(toValueScale(0, [100, 200])).toEqual({ ceiling: 100, ticks: [0, 100] });
  });

  it('держит постоянный потолок при шаге в его треть', () => {
    expect(toValueScale(900, [300]).ticks).toEqual([0, 300, 600, 900]);
  });

  it('делит байты по ступеням килобайта, а не по десяткам', () => {
    expect(toValueScale(3000, BYTE_STEPS).ticks).toEqual([0, 1024, 2048, 3072]);
  });
});

describe('toTimeWindow', () => {
  it('пока буфер не заполнен, начинается с первой точки', () => {
    expect(toTimeWindow(90, 100, 59)).toEqual({ min: 90, max: 100 });
  });

  it('на заполненном буфере держит постоянную ширину окна', () => {
    expect(toTimeWindow(10, 100, 59)).toEqual({ min: 41, max: 100 });
  });
});

describe('toTimeTicks', () => {
  it('ставит отсечки назад от правой кромки и не выходит за окно', () => {
    expect(toTimeTicks({ min: 81, max: 100 }, 15)).toEqual([85, 100]);
  });
});

describe('toMirroredTicks', () => {
  it('отражает деления вниз и не повторяет ноль', () => {
    expect(toMirroredTicks([0, 5, 10])).toEqual([-10, -5, 0, 5, 10]);
  });
});
