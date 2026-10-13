import { DELAY_STATE, type DelayState } from '@entities/Proxy';

/** Latency tone: one for the node tile and the legend, otherwise the legend diverges from the tiles. */
export const DELAY_TONE: Readonly<Record<DelayState, string>> = {
  [DELAY_STATE.Fast]: 'text-signal-ok',
  [DELAY_STATE.Slow]: 'text-signal-warn',
  [DELAY_STATE.Failed]: 'text-signal-bad',
  [DELAY_STATE.Unknown]: 'text-muted-foreground',
};
