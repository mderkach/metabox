import { toValueScale } from '@shared/lib/chart';

export const SCALE_CEILING = 1500;

const SCALE_STEP = 500;

export const SCALE = toValueScale(SCALE_CEILING, [SCALE_STEP]);
