import { z } from 'zod';

import { cidrContains, parseIpv4Cidr } from '@shared/lib/ipv4';
import { isRecord } from '@shared/lib/isRecord';

const MATCHERS = ['domain', 'domain_suffix', 'rule_set', 'ip_cidr'] as const;
type PlainRouteMatcher = (typeof MATCHERS)[number];
type Relation = 'covers' | 'disjoint' | 'unknown';

const IP = z.union([z.ipv4(), z.ipv6()]);
const PREFIX = z.union([IP, z.cidrv4(), z.cidrv6()]);
const DOMAIN = z.hostname();

export function isLiteralRuleIp(value: string) {
  return IP.safeParse(value).success;
}

export function parseRuleAddress(value: string) {
  const address = value.trim().toLowerCase();
  if (isLiteralRuleIp(address)) return { ip_cidr: [address] };
  const domain = address.replace(/\.$/, '');
  if (!domain.endsWith('.') && !/^[\d.]+$/.test(domain) && DOMAIN.safeParse(domain).success)
    return { domain: [domain] };
  return null;
}

function values(value: unknown): string[] | undefined {
  if (typeof value === 'string' && value !== '') return [value];
  if (Array.isArray(value) && value.length && value.every((item): item is string => typeof item === 'string' && !!item))
    return value;
  return undefined;
}

export function readPlainRouteConditions(node: unknown) {
  if (
    !isRecord(node) ||
    typeof node.outbound !== 'string' ||
    !node.outbound ||
    (node.action !== undefined && node.action !== 'route') ||
    (node.type !== undefined && node.type !== 'default') ||
    !Object.keys(node).every((key) => ['type', 'outbound', 'action', 'source_ip_cidr', ...MATCHERS].includes(key))
  )
    return null;
  const keys = MATCHERS.filter((key) => Object.hasOwn(node, key));
  const key = keys.at(0);
  const entries = key && values(node[key]);
  const sources = values(node.source_ip_cidr);
  if (keys.length > 1 || (key && !entries) || (Object.hasOwn(node, 'source_ip_cidr') && !sources)) return null;
  if (sources?.some((value) => !PREFIX.safeParse(value).success) === true) return null;
  if (entries && key === 'ip_cidr' && entries.some((value) => !PREFIX.safeParse(value).success)) return null;
  if (
    entries &&
    (key === 'domain' || key === 'domain_suffix') &&
    entries.some((value) => value !== value.toLowerCase() || value.endsWith('.') || !DOMAIN.safeParse(value).success)
  )
    return null;
  return { key, entries, sources };
}

function addressRelation(left: string, right: string): Relation {
  if (left === right) return 'covers';
  const a = parseIpv4Cidr(left);
  const b = parseIpv4Cidr(right);
  if (a && b) {
    if (a.prefix <= b.prefix && cidrContains(a, b.address)) return 'covers';
    return cidrContains(b, a.address) ? 'unknown' : 'disjoint';
  }
  if (left.includes(':') && right.includes(':') && !left.includes('/') && !right.includes('/')) {
    return new URL(`http://[${left}]/`).hostname === new URL(`http://[${right}]/`).hostname ? 'covers' : 'disjoint';
  }
  return 'unknown';
}

function destinationRelation(a: PlainRouteMatcher, left: string, b: PlainRouteMatcher, right: string): Relation {
  if (a === 'rule_set' || b === 'rule_set') return a === b && left === right ? 'covers' : 'unknown';
  if (a === 'ip_cidr' || b === 'ip_cidr') return a === b ? addressRelation(left, right) : 'unknown';
  const outer = left.toLowerCase();
  const inner = right.toLowerCase();
  if (a === 'domain_suffix' && (outer === inner || inner.endsWith(`.${outer}`))) return 'covers';
  if (b === 'domain_suffix' && (outer === inner || outer.endsWith(`.${inner}`))) return 'unknown';
  return outer === inner ? 'covers' : 'disjoint';
}

function compareLists(
  outer: string[] | undefined,
  inner: string[] | undefined,
  compare: (left: string, right: string) => Relation
): Relation {
  if (!outer) return 'covers';
  if (!inner) return 'unknown';
  const matches = inner.map((value) => outer.map((candidate) => compare(candidate, value)));
  if (matches.every((list) => list.includes('covers'))) return 'covers';
  return matches.every((list) => list.every((match) => match === 'disjoint')) ? 'disjoint' : 'unknown';
}

export function compareRouteConditions(earlier: unknown, later: unknown): Relation {
  const left = readPlainRouteConditions(earlier);
  const right = readPlainRouteConditions(later);
  if (!left || !right) return 'unknown';
  const source = compareLists(left.sources, right.sources, addressRelation);
  const a = left.key;
  const b = right.key;
  const dest = compareLists(left.entries, right.entries, (outer, inner) =>
    a && b ? destinationRelation(a, outer, b, inner) : 'unknown'
  );
  if (source === 'disjoint' || dest === 'disjoint') return 'disjoint';
  return source === 'covers' && dest === 'covers' ? 'covers' : 'unknown';
}
