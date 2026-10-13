import { ROUTE_REASON_CODE } from '../api/Route.schema';

/** Reason codes why the rule could not be determined: the set is declared by the daemon. */
export type RouteReasonCode = (typeof ROUTE_REASON_CODE)[number];

/**
 * Origin of a claim. There are exactly three values, and a claim without an
 * origin does not reach the screen.
 */
export const ROUTE_ORIGIN = {
  /** Came from core: the rule list, the matched rule, the chain. */
  Observed: 'observed',
  /** Computed by metabox or obtained by asking the binary. */
  Computed: 'computed',
  /** Nothing to compute with. */
  Unknown: 'unknown',
} as const;

export type RouteOrigin = (typeof ROUTE_ORIGIN)[keyof typeof ROUTE_ORIGIN];

export const ROUTE_MATCH = {
  Rule: 'rule',
  /** No rule matched: `route.final` was used. */
  Final: 'final',
  Unknown: 'unknown',
} as const;

export type RouteMatchKind = (typeof ROUTE_MATCH)[keyof typeof ROUTE_MATCH];

export interface RouteRule {
  origin: RouteOrigin;
  /** `route.rules` node index, counting from zero. */
  index: number;
  type: string;
  conditions: string;
  action: string;
}

export interface RouteMatch {
  origin: RouteOrigin;
  kind: RouteMatchKind;
  /** `null` means there is no node in `route.rules`: `final` or unknown. */
  index: number | null;
  conditions: string;
  action: string;
  /** Why it could not be computed; empty for a found rule. */
  reasonCode: RouteReasonCode | null;
  /** The same reason in the daemon's words: fallback text for an unfamiliar code. */
  reason: string;
}

export interface RouteExplanation {
  connectionId: string;
  match: RouteMatch;
  chain: {
    origin: RouteOrigin;
    /** Core order: from the final node to the group. */
    nodes: string[];
  };
  rules: RouteRule[];
}

/**
 * Rule hit count of the running process. Observable: a connection that closed
 * between two daemon snapshots does not get into it.
 */
export interface RuleHits {
  /** How long the count has been running: since the daemon start, its restart resets it. */
  seconds: number;
  /**
   * Hits by process `route.rules` index, counting from zero. `null` means core
   * does not see the rule in the connection list: `sniff` does not stop the
   * search, and intercepted DNS and a rejected connection do not get there.
   */
  byIndex: readonly (number | null)[];
  /** Connections that went to `route.final`. */
  final: number;
}
