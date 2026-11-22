import { LATENCY_CEILING_MS } from '@entities/Proxy';
import { toValueScale } from '@shared/lib/chart';

const SCALE_STEP = 500;

export const SCALE = toValueScale(LATENCY_CEILING_MS, [SCALE_STEP]);
