import { RULE_SET_MATCHER } from './Rule.constants';
import type { RuleBranch, RuleMatcher } from './Rule.model';

/** The condition a label derived from the rule content starts with. */
export interface RuleCaption {
  /** Schema key of the main condition; `null` when there is none. */
  key: string | null;
  /**
   * First value of the main condition, or the device label for a source
   * device. `null` means there is no condition to show: the rule takes all
   * traffic, or the panel does not know its fields.
   */
  condition: string | null;
  /** Values of the same condition beyond the first one. */
  more: number;
}

const SOURCE_MATCHER = 'source_ip_cidr';

/**
 * Conditions that tell the most about the traffic go first: what is matched,
 * then where it goes, then who sends it. The rest follow in schema order.
 */
const CAPTION_ORDER: readonly string[] = [
  RULE_SET_MATCHER,
  'domain_suffix',
  'domain',
  'domain_keyword',
  'domain_regex',
  'geosite',
  'ip_cidr',
  'geoip',
  SOURCE_MATCHER,
  'source_mac_address',
  'source_hostname',
  'process_name',
  'package_name',
  'protocol',
  'port',
  'port_range',
];

/** The mask of one host: such a source condition is a single device. */
const HOST_MASK = /\/(?:32|128)$/;

/** The address of a condition value that is one host; a subnet stays as is. */
export function toHostAddress(value: string): string {
  return value.replace(HOST_MASK, '');
}

function matchersOf(branch: Pick<RuleBranch, 'matchers' | 'group'>): RuleMatcher[] {
  return [...branch.matchers, ...(branch.group?.children.flatMap(matchersOf) ?? [])];
}

function rankOf(key: string): number {
  const rank = CAPTION_ORDER.indexOf(key);

  return rank === -1 ? CAPTION_ORDER.length : rank;
}

/**
 * The main condition of a rule without a name: a known source device wins,
 * since "this device → that outbound" is how the rule was made; then the
 * first condition by `CAPTION_ORDER`. Nested branches of a logical rule count
 * too. `deviceOf` returns the device label by address, `null` for an address
 * that is not a device.
 */
export function toRuleCaption(
  rule: Pick<RuleBranch, 'matchers' | 'group'>,
  deviceOf: (address: string) => string | null
): RuleCaption {
  const matchers = matchersOf(rule).filter((matcher) => matcher.values.length > 0);

  for (const matcher of matchers.filter((item) => item.key === SOURCE_MATCHER)) {
    const device = matcher.values.map((value) => deviceOf(toHostAddress(value))).find((label) => label !== null);

    if (device !== undefined) {
      return { key: SOURCE_MATCHER, condition: device, more: matcher.values.length - 1 };
    }
  }

  const main = matchers.toSorted((left, right) => rankOf(left.key) - rankOf(right.key)).at(0);

  return main === undefined
    ? { key: null, condition: null, more: 0 }
    : { key: main.key, condition: main.values[0], more: main.values.length - 1 };
}
