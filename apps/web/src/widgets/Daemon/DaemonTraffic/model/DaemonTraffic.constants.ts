export const TIME_TICK_SECONDS = 15;

/** Ticks per half: a burst reads by the middle of the half, not only by shape. */
export const HALF_INTERVALS = 2;

export const FILL_ALPHA = 0.2;
export const LINE_WIDTH = 1.5;

const DASH_STROKE = 2;
const DASH_GAP = 3;

/** Grid dash in pixels. */
export const GRID_DASH = [DASH_STROKE, DASH_GAP];

const BITS_IN_BYTE = 8;
const BITS_IN_MEGABIT = 1_000_000;

/**
 * Lower bound of the traffic scale — one megabit per second, in bytes. Without it, on an
 * idle channel the scale would shrink to kilobytes, and background noise would be drawn
 * as full-height peaks.
 */
export const TRAFFIC_MIN_CEILING = BITS_IN_MEGABIT / BITS_IN_BYTE;
