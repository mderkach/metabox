/** Latency at which a node is considered unavailable: sing-box serves 65535. */
export const DELAY_TIMEOUT = 65_535;

/**
 * Boundary of "fast", milliseconds: the threshold at which a node switch is not
 * yet noticeable. Screens name it in the tone legend, otherwise 290 and 310 ms
 * of different color look like chance.
 */
export const DELAY_FAST = 300;

export const DELAY_STATE = {
  Fast: 'fast',
  Slow: 'slow',
  Failed: 'failed',
  Unknown: 'unknown',
} as const;

export type DelayState = (typeof DELAY_STATE)[keyof typeof DELAY_STATE];

/** Clash API group types: they have `all`, other nodes do not. */
export const GROUP_TYPES: ReadonlySet<string> = new Set(['Selector', 'URLTest', 'Fallback', 'LoadBalance']);

/**
 * Clash API service groups. They do not exist in the config, and switching
 * `GLOBAL` would send all traffic past the rules.
 */
export const SERVICE_GROUPS: ReadonlySet<string> = new Set(['GLOBAL', 'DIRECT', 'REJECT']);

export interface ProxyNode {
  name: string;
  type: string;
  /** `null` means the node was never checked. */
  delay: number | null;
  delayState: DelayState;
  /** The node is selected by the group right now. */
  selected: boolean;
}

export interface ProxyGroup {
  name: string;
  type: string;
  /** The user picks a node only for a selector; a URL test decides on its own. */
  selectable: boolean;
  now: string | null;
  nodes: ProxyNode[];
}

/** Grouping lives in the model: the optimistic selection update uses it too. */
export interface ProxyRuntime {
  groups: ProxyGroup[];
  standalone: ProxyNode[];
}

/**
 * When the subscription was updated. `never` means the runtime served the Go
 * zero date (`0001-01-01…`) or the epoch: the subscription was never loaded.
 * `unknown` means the string did not parse as a date; the schema does not check
 * the format.
 */
export type ProviderUpdate =
  | { kind: 'never' }
  | { kind: 'unknown'; raw: string }
  | { kind: 'at'; at: Date; raw: string };

export interface ProviderUsage {
  /** Upload + Download. */
  used: number;
  /** `0` means the subscription did not report a limit. */
  total: number;
}

export interface ProxyProvider {
  name: string;
  nodes: number;
  update: ProviderUpdate;
  /** `null` when the subscription did not send `subscription-userinfo` or it holds only zeros. */
  usage: ProviderUsage | null;
  /** `null` when the expiry is not reported. */
  expiresAt: Date | null;
}
