/**
 * Chart math for the panel: shares, scales, ticks and geometry. Markup and colors
 * are kept by the charts themselves.
 */

/** A line cannot be drawn through a single point. */
const MIN_POINTS = 2;

/** Hundredths of the area: the area stretches to fit in place anyway. */
const COORD_PRECISION = 2;

const FULL_TURN = 360;

export interface AreaGeometry {
  /** Points for `polyline`. */
  line: string;
  /** Closed outline under the line for the fill. */
  area: string;
}

/** Share of the total; a zero total gives zero, not `NaN`. */
export function toShare(value: number, total: number): number {
  return total > 0 ? value / total : 0;
}

/**
 * A series from the zero line upward. The peak is set from outside: neighboring charts
 * share it, and one computed inside would spread their scales apart.
 */
export function toAreaGeometry(values: number[], peak: number, width: number, height: number): AreaGeometry | null {
  if (values.length < MIN_POINTS) {
    return null;
  }

  const step = width / (values.length - 1);
  const points = values.map((value, index) => {
    const y = height * (1 - toShare(value, peak));

    return `${(step * index).toFixed(COORD_PRECISION)},${y.toFixed(COORD_PRECISION)}`;
  });

  return {
    line: points.join(' '),
    area: `M0,${String(height)} L${points.join(' L')} L${String(width)},${String(height)} Z`,
  };
}

const PERCENT = 100;

/**
 * Shares as whole percentages, summing to exactly one hundred. Rounding each share
 * separately gives 88 and 13 on a summary of two groups — the largest remainder
 * method gives the difference to the one where it is larger.
 */
export function toPercents(values: number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);

  // Without this branch an empty summary would hand all hundred percent to zero shares.
  if (total === 0) {
    return values.map(() => 0);
  }

  const exact = values.map((value) => toShare(value, total) * PERCENT);
  const floors = exact.map((value) => Math.floor(value));
  const spare = PERCENT - floors.reduce((sum, value) => sum + value, 0);
  const remainders = exact.map((value, index) => value - floors[index]);

  const order = new Set(
    [...remainders.keys()].sort((left, right) => remainders[right] - remainders[left]).slice(0, Math.max(0, spare))
  );

  return floors.map((value, index) => (order.has(index) ? value + 1 : value));
}

export interface DonutSegment {
  /** `stroke-dasharray` value: the arc length and the rest of the circumference. */
  dash: string;
  /** Rotation of the arc start in degrees — it lines segments up one after another. */
  turn: number;
}

/**
 * A ring from shares, one circle per segment. Arcs are drawn with a dash, not
 * with `arc` paths: with a dash a share is a length, and it does not have to be computed
 * by trigonometry for each segment.
 */
export function toDonutSegments(values: number[], circumference: number): DonutSegment[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  let passed = 0;

  return values.map((value) => {
    const share = toShare(value, total);
    const turn = passed * FULL_TURN;

    passed += share;

    return {
      dash: `${(circumference * share).toFixed(COORD_PRECISION)} ${circumference.toFixed(COORD_PRECISION)}`,
      turn,
    };
  });
}

/** No more than four ticks on the scale: otherwise labels in a narrow card overlap each other. */
const TICK_INTERVALS = 4;

/** Round scale multipliers: 1, 2 and 5 at each decimal order. */
const NICE = { One: 1, Two: 2, Five: 5 } as const;
const DECADE = 10;
const DECADES_IN_STAGE = 3;

const BYTE_BASE = 1024;
const BYTE_STAGES = 5;

const NICE_MULTIPLIERS = Array.from({ length: DECADES_IN_STAGE }, (_, decade) =>
  Object.values(NICE).map((multiplier) => multiplier * DECADE ** decade)
).flat();

/**
 * Steps 1–2–5 within each kilobyte tier. Decimal steps would give
 * labels like "97.7 kB" — the scale reads in round values in the units
 * that `formatBytes` prints.
 */
export const BYTE_STEPS: readonly number[] = Array.from({ length: BYTE_STAGES }, (_, stage) =>
  NICE_MULTIPLIERS.map((multiplier) => multiplier * BYTE_BASE ** stage)
).flat();

const DECIMAL_DECADES = 6;

/** Steps 1–2–5 for countable quantities: connections, requests. */
export const COUNT_STEPS: readonly number[] = Array.from({ length: DECIMAL_DECADES }, (_, decade) =>
  Object.values(NICE).map((multiplier) => multiplier * DECADE ** decade)
).flat();

export interface ValueScale {
  /** Right or top edge of the scale: a multiple of the step and not below the maximum. */
  ceiling: number;
  /** Ticks from zero to the edge inclusive. */
  ticks: number[];
}

/**
 * A scale from zero: the first step at which the maximum fits into the given
 * number of ticks. A zero maximum gives a scale of one smallest step, not a
 * degenerate one.
 */
export function toValueScale(max: number, steps: readonly number[], intervals = TICK_INTERVALS): ValueScale {
  const step = steps.find((candidate) => candidate * intervals >= max) ?? steps[steps.length - 1];
  const count = Math.max(1, Math.ceil(max / step));

  return { ceiling: step * count, ticks: Array.from({ length: count + 1 }, (_, index) => index * step) };
}

/** Headroom above the peak of a series without capacity: otherwise a flat series is pressed against the top edge. */
const HEADROOM = 1.15;

/**
 * Top of the scale of a series without axes. With capacity — core count, memory size — the height
 * tells what part of it is used; a series that outgrew the capacity stretches the scale
 * to its own peak. Without capacity the top is the peak with headroom, and the chart shows only
 * the shape of the series.
 */
export function toSparkCeiling(peak: number, capacity?: number): number {
  return capacity === undefined ? peak * HEADROOM : Math.max(capacity, peak);
}

/** How many times a quantity must fall for the scale to shrink. */
const SHRINK_RATIO = 4;

/**
 * Scale edge with headroom for fluctuations: grows at once when the quantity
 * outgrows it, and shrinks only when the quantity fell fourfold. Otherwise a live
 * series wandering around a step would redraw ticks every second
 * and frames could not be compared with each other.
 */
export function toStickyCeiling(current: number, needed: number): number {
  if (needed > current || needed * SHRINK_RATIO <= current) {
    return needed;
  }

  return current;
}

export interface TimeWindow {
  min: number;
  max: number;
}

/** Cutoffs back from the right edge with step `step` while they are inside the window. */
export function toTimeTicks({ min, max }: TimeWindow, step: number): number[] {
  const count = Math.floor((max - min) / step);

  return Array.from({ length: count + 1 }, (_, index) => max - (count - index) * step);
}

/** Scale ticks from zero, mirrored downward: for two series on opposite sides of the axis. */
export function toMirroredTicks(ticks: number[]): number[] {
  return [
    ...ticks
      .slice(1)
      .toReversed()
      .map((tick) => -tick),
    ...ticks,
  ];
}
