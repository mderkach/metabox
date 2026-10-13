import { describe, expect, it } from 'vitest';

import {
  COUNT_STEPS,
  toSparkCeiling,
  toStickyCeiling,
  BYTE_STEPS,
  toAreaGeometry,
  toMirroredTicks,
  toDonutSegments,
  toPercents,
  toShare,
  toTimeTicks,
  toValueScale,
} from '../chart';

describe('COUNT_STEPS', () => {
  it('gives a round edge for the connection count', () => {
    expect(toValueScale(207, COUNT_STEPS).ceiling).toBe(300);
  });
});

describe('toSparkCeiling', () => {
  it('with a capacity puts the top at it, not at the series peak', () => {
    expect(toSparkCeiling(386, 7800)).toBe(7800);
  });

  it('a series that outgrew the capacity stretches the scale to the peak', () => {
    expect(toSparkCeiling(6, 4)).toBe(6);
  });

  it('without a capacity takes the peak with a margin', () => {
    expect(toSparkCeiling(100)).toBeCloseTo(115);
  });
});

describe('toStickyCeiling', () => {
  it('grows at once as soon as the value outgrows the edge', () => {
    expect(toStickyCeiling(2048, 5120)).toBe(5120);
  });

  it('holds the edge until the value drops fourfold', () => {
    expect(toStickyCeiling(5120, 2048)).toBe(5120);
    expect(toStickyCeiling(5120, 1024)).toBe(1024);
  });
});

describe('toShare', () => {
  it('on a zero sum returns zero, not NaN', () => {
    expect(toShare(0, 0)).toBe(0);
  });

  it('computes the share of the sum', () => {
    expect(toShare(1, 4)).toBe(0.25);
  });
});

describe('toAreaGeometry', () => {
  it('does not build a line from one point', () => {
    expect(toAreaGeometry([5], 10, 100, 100)).toBeNull();
  });

  it('puts the value at the peak to the top of the area, and zero to the bottom', () => {
    const geometry = toAreaGeometry([0, 10], 10, 100, 50);

    expect(geometry?.line).toBe('0.00,50.00 100.00,0.00');
  });

  it('closes the contour along the lower edge of the area', () => {
    const geometry = toAreaGeometry([10, 10], 10, 100, 50);

    expect(geometry?.area).toBe('M0,50 L0.00,0.00 L100.00,0.00 L100,50 Z');
  });
});

describe('toPercents', () => {
  it('distributes the remainder so the shares add up to a hundred', () => {
    expect(toPercents([7, 1])).toEqual([88, 12]);
  });

  it('keeps the sum at a hundred on three shares too', () => {
    const percents = toPercents([1, 1, 1]);

    expect(percents.reduce((sum, value) => sum + value, 0)).toBe(100);
  });

  it('on empty data returns zeros, not NaN', () => {
    expect(toPercents([0, 0])).toEqual([0, 0]);
  });
});

describe('toDonutSegments', () => {
  it('puts each segment after the previous one', () => {
    const segments = toDonutSegments([1, 1], 100);

    expect(segments.map((segment) => segment.turn)).toEqual([0, 180]);
    expect(segments[0].dash).toBe('50.00 100.00');
  });
});

describe('toValueScale', () => {
  it('takes the smallest step at which the maximum fits the divisions', () => {
    expect(toValueScale(700, [100, 200, 500])).toEqual({ ceiling: 800, ticks: [0, 200, 400, 600, 800] });
  });

  it('on a zero maximum builds a one-step scale, not a degenerate one', () => {
    expect(toValueScale(0, [100, 200])).toEqual({ ceiling: 100, ticks: [0, 100] });
  });

  it('holds a constant ceiling at a step of a third of it', () => {
    expect(toValueScale(900, [300]).ticks).toEqual([0, 300, 600, 900]);
  });

  it('divides bytes by kilobyte steps, not by tens', () => {
    expect(toValueScale(3000, BYTE_STEPS).ticks).toEqual([0, 1024, 2048, 3072]);
  });
});

describe('toTimeTicks', () => {
  it('puts cutoffs back from the right edge and does not leave the window', () => {
    expect(toTimeTicks({ min: 81, max: 100 }, 15)).toEqual([85, 100]);
  });
});

describe('toMirroredTicks', () => {
  it('mirrors the divisions downward and does not repeat zero', () => {
    expect(toMirroredTicks([0, 5, 10])).toEqual([-10, -5, 0, 5, 10]);
  });
});
