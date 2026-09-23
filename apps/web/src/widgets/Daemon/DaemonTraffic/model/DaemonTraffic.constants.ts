export const TIME_TICK_SECONDS = 15;

/** Делений на половину: всплеск читается по середине половины, а не только по форме. */
export const HALF_INTERVALS = 2;

export const FILL_ALPHA = 0.2;
export const LINE_WIDTH = 1.5;

const DASH_STROKE = 2;
const DASH_GAP = 3;

/** Пунктир сетки в пикселях. */
export const GRID_DASH = [DASH_STROKE, DASH_GAP];

const BITS_IN_BYTE = 8;
const BITS_IN_MEGABIT = 1_000_000;

/**
 * Нижний предел шкалы трафика — мегабит в секунду, в байтах. Без него на
 * простаивающем канале шкала сжималась бы до килобайт, и фоновый шум рисовался
 * бы пиками во всю высоту.
 */
export const TRAFFIC_MIN_CEILING = BITS_IN_MEGABIT / BITS_IN_BYTE;
