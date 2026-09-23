export const TIME_TICK_SECONDS = 15;

/** Делений на половину: всплеск читается по середине половины, а не только по форме. */
export const HALF_INTERVALS = 2;

export const FILL_ALPHA = 0.2;
export const LINE_WIDTH = 1.5;

const DASH_STROKE = 2;
const DASH_GAP = 3;

/** Пунктир сетки в пикселях. */
export const GRID_DASH = [DASH_STROKE, DASH_GAP];

const BYTES_IN_KIBIBYTE = 1024;
const BYTES_IN_MEBIBYTE = BYTES_IN_KIBIBYTE * BYTES_IN_KIBIBYTE;

/**
 * Нижний предел шкалы трафика, байт в секунду. Без него на простаивающем
 * канале шкала сжималась бы до килобайт, и фоновый шум рисовался бы пиками во
 * всю высоту.
 */
export const TRAFFIC_MIN_CEILING = BYTES_IN_MEBIBYTE;
