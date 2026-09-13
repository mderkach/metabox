import { describe, expect, it } from 'vitest';

import { toAreaGeometry, toDonutSegments, toPercents, toShare } from '../chart';

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
