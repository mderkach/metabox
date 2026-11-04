import { DELAY_FAST } from '@entities/Proxy';
import { toValueScale } from '@shared/lib/chart';

const SCALE_INTERVALS = 3;

export const SCALE_CEILING = DELAY_FAST * SCALE_INTERVALS;

export const SCALE = toValueScale(SCALE_CEILING, [DELAY_FAST]);
