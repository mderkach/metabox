import { DELAY_STATE, type DelayState } from '@entities/Proxy';

/** Тон задержки: один на плитку узла и на легенду, иначе легенда разойдётся с плитками. */
export const DELAY_TONE: Readonly<Record<DelayState, string>> = {
  [DELAY_STATE.Fast]: 'text-signal-ok',
  [DELAY_STATE.Slow]: 'text-signal-warn',
  [DELAY_STATE.Failed]: 'text-signal-bad',
  [DELAY_STATE.Unknown]: 'text-muted-foreground',
};
