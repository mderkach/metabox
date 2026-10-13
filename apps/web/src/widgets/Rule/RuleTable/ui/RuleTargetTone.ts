import { ROUTE_KIND, toOutboundKind, type RouteKind } from '@entities/Connection';
import { RULE_TARGET, type RuleTargetKind } from '@entities/Rule';

/** An action is not a traffic outbound but an intervention in it: its own neutral tone. */
const ACTION_TONE = 'text-route-neutral';
const PROXY_TONE = 'text-route-proxy';

/** Tone by packet fate derived from the outbound type. */
const KIND_TONES: Readonly<Record<RouteKind, string>> = {
  [ROUTE_KIND.Direct]: 'text-route-direct',
  [ROUTE_KIND.Proxy]: PROXY_TONE,
  [ROUTE_KIND.Block]: 'text-route-block',
  [ROUTE_KIND.Dns]: 'text-route-dns',
  [ROUTE_KIND.Other]: ACTION_TONE,
};

/**
 * Fallback "substring → tone" table, not a chain of conditions: for an action and for
 * a tag that is not in the config there is no tone by type, and the match is sought by
 * common names.
 */
const OUTBOUND_TONES = [
  { match: 'direct', tone: 'text-route-direct' },
  { match: 'block', tone: 'text-route-block' },
  { match: 'reject', tone: 'text-route-block' },
  { match: 'dns', tone: 'text-route-dns' },
] as const;

/**
 * Rule outbound color. The outbound type is primary: the tag is written by the user, and
 * a `directional` of type `vless` is a proxy, not a direct outbound.
 */
export function toTargetTone(kind: RuleTargetKind, target: string, outboundTypes: ReadonlyMap<string, string>): string {
  const typed = kind === RULE_TARGET.Outbound ? toOutboundKind(target, outboundTypes) : null;

  if (typed !== null) {
    return KIND_TONES[typed];
  }

  const lower = target.toLowerCase();
  const known = OUTBOUND_TONES.find((entry) => lower.includes(entry.match))?.tone;

  if (known !== undefined) {
    return known;
  }

  return kind === RULE_TARGET.Outbound ? PROXY_TONE : ACTION_TONE;
}
