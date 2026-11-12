import { ACCESS_MODE } from '../api/Dataplane.schema';

export type AccessMode = (typeof ACCESS_MODE)[number];

export const ACL_MODE = {
  All: 'all',
  Listed: 'listed',
} as const satisfies Record<string, AccessMode>;

/** The `metabox.dataplane` section. Written entirely: the daemon reads a missing field as zero. */
export interface DataplaneModel {
  enabled: boolean;
  redirectPort: number;
  tproxyPort: number;
  dnsPort: number;
  dnsHijack: boolean;
  selfMark: number;
  tproxyMark: number;
  routeTable: number;
  /** A string, not `AccessMode`: a mode the panel does not know goes back as it came. */
  aclMode: string;
  /** IPv4 address or subnet. */
  sourceIp: readonly string[];
  sourceMac: readonly string[];
  /** Sources that go direct in `listed` mode even when `sourceIp` or `sourceMac` lists them. */
  sourceIpExclude: readonly string[];
  sourceMacExclude: readonly string[];
  lanInterface: readonly string[];
  wanProxyCidr: readonly string[];
  wanDirectCidr: readonly string[];
  ipv6: boolean;
}

export interface Dataplane {
  model: DataplaneModel;
  /** Section fingerprint from `ETag`: with it the change goes into `If-Match`. */
  etag: string | null;
}

/** LAN traffic source that can be sent through sing-box. */
export interface RouteSource {
  mac: string;
  /** Empty when there is no address. */
  ip: string;
  /** The lease is static: the address is pinned to the device. */
  static: boolean;
}

const HOST_PREFIX = '/32';
const IPV4_BITS = 32;
const IPV4_OCTET_MAX = 255;
const IPV4_OCTETS = 4;
const OCTET_BITS = 8;
const IPV4_CIDR = /^(\d{1,3}(?:\.\d{1,3}){3})(?:\/(\d{1,2}))?$/;

/** IPv4 address or subnet from `source_ip`; the address is an unsigned 32-bit number. */
export interface Ipv4Cidr {
  address: number;
  prefix: number;
}

/**
 * A `source_ip` entry as an address and a prefix length; a bare address is a
 * `/32` subnet. IPv6 and anything that does not parse as IPv4 give `null`: the
 * daemon builds devices from DHCPv4 leases, and there is nothing to match IPv6
 * against.
 */
export function parseIpv4Cidr(entry: string): Ipv4Cidr | null {
  const match = IPV4_CIDR.exec(entry);

  if (match === null) return null;

  // An optional group without a match is `undefined`, although the RegExp type promises a string.
  const [, address = '', length = ''] = match;
  const octets = address.split('.').map(Number);
  const prefix = length === '' ? IPV4_BITS : Number(length);

  if (octets.some((octet) => octet > IPV4_OCTET_MAX) || prefix > IPV4_BITS) return null;

  return { address: octets.reduce((value, octet) => value * (IPV4_OCTET_MAX + 1) + octet, 0), prefix };
}

/** The address falls into the subnet. The mask drops host bits: `192.168.1.67/29` reads as `192.168.1.64/29`. */
export function cidrContains(cidr: Ipv4Cidr, address: number): boolean {
  const mask = maskOf(cidr.prefix);

  return (cidr.address & mask) >>> 0 === (address & mask) >>> 0;
}

function maskOf(prefix: number): number {
  return prefix === 0 ? 0 : (~0 << (IPV4_BITS - prefix)) >>> 0;
}

function formatIpv4(address: number): string {
  return Array.from({ length: IPV4_OCTETS }, (_, index) =>
    String((address >>> ((IPV4_OCTETS - 1 - index) * OCTET_BITS)) & IPV4_OCTET_MAX)
  ).join('.');
}

export const SOURCE_IP_ERROR = {
  Invalid: 'invalid',
  HostBits: 'hostBits',
} as const;

export type SourceIpError =
  | { kind: typeof SOURCE_IP_ERROR.Invalid }
  | { kind: typeof SOURCE_IP_ERROR.HostBits; subnet: string };

/**
 * Checks a `source_ip` entry by the daemon rule: an IPv4 address or a subnet
 * without host bits, since nft does not take `192.168.1.5/24` into a set. For
 * host bits the error carries the subnet the entry was meant to be.
 */
export function sourceIpError(entry: string): SourceIpError | null {
  const cidr = parseIpv4Cidr(entry);

  if (cidr === null) return { kind: SOURCE_IP_ERROR.Invalid };

  const network = (cidr.address & maskOf(cidr.prefix)) >>> 0;

  return network === cidr.address
    ? null
    : { kind: SOURCE_IP_ERROR.HostBits, subnet: `${formatIpv4(network)}/${String(cidr.prefix)}` };
}

function sameMac(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

/** The address is written in `source_ip` by itself or as a one-host subnet; the daemon accepts both forms. */
function isHostOf(entry: string, ip: string): boolean {
  return ip !== '' && (entry === ip || entry === `${ip}${HOST_PREFIX}`);
}

/** The first entry that contains the address; `wider` skips one-host entries. */
function entryContaining(entries: readonly string[], ip: string, wider: boolean): string | null {
  const address = parseIpv4Cidr(ip);

  if (address === null || address.prefix !== IPV4_BITS) return null;

  return (
    entries.find((entry) => {
      const cidr = parseIpv4Cidr(entry);

      return cidr !== null && (!wider || cidr.prefix < IPV4_BITS) && cidrContains(cidr, address.address);
    }) ?? null
  );
}

/** A subnet wider than one host that contains the address. */
function subnetOf(entries: readonly string[], ip: string): string | null {
  return entryContaining(entries, ip, true);
}

/** nft checks the exclusions before the interception list, so an excluded device goes direct whatever lists it. */
function isExcluded(model: DataplaneModel, source: RouteSource): boolean {
  return (
    model.sourceMacExclude.some((mac) => sameMac(mac, source.mac)) ||
    entryContaining(model.sourceIpExclude, source.ip, false) !== null
  );
}

export const ROUTE_REASON = {
  Mac: 'mac',
  Host: 'host',
  Subnet: 'subnet',
  Excluded: 'excluded',
  ExcludedSubnet: 'excludedSubnet',
} as const;

/**
 * Why a device goes through sing-box in `listed` mode, or, for `excluded`, why
 * it goes direct although a subnet from the interception list contains it.
 * `excludedSubnet` is an exclusion wider than the device: its toggle cannot lift it
 * without taking the other devices of that subnet along.
 */
export type RouteReason =
  | { kind: typeof ROUTE_REASON.Mac }
  | { kind: typeof ROUTE_REASON.Host }
  | { kind: typeof ROUTE_REASON.Subnet; subnet: string }
  | { kind: typeof ROUTE_REASON.Excluded; subnet: string }
  | { kind: typeof ROUTE_REASON.ExcludedSubnet; subnet: string };

export function isRouted(reason: RouteReason | null): boolean {
  return reason !== null && reason.kind !== ROUTE_REASON.Excluded && reason.kind !== ROUTE_REASON.ExcludedSubnet;
}

/**
 * `null` means the device goes direct and nothing lists it. An exclusion
 * without a subnet around the device is not named: it changes nothing.
 */
export function routeReason(model: DataplaneModel, source: RouteSource): RouteReason | null {
  const excludedBy = subnetOf(model.sourceIpExclude, source.ip);

  if (excludedBy !== null) return { kind: ROUTE_REASON.ExcludedSubnet, subnet: excludedBy };

  const subnet = subnetOf(model.sourceIp, source.ip);

  if (isExcluded(model, source)) return subnet === null ? null : { kind: ROUTE_REASON.Excluded, subnet };

  if (subnet !== null) return { kind: ROUTE_REASON.Subnet, subnet };

  if (model.sourceMac.some((mac) => sameMac(mac, source.mac))) return { kind: ROUTE_REASON.Mac };

  if (model.sourceIp.some((ip) => isHostOf(ip, source.ip))) return { kind: ROUTE_REASON.Host };

  return null;
}

/**
 * Model with the device in the interception list or without it.
 *
 * Turning on writes the MAC: it survives a DHCP lease change, while a dynamic
 * lease address may go to another device after an hour, and that one would go
 * through sing-box instead. A static lease address is pinned to the device, so
 * it is written too: by MAC nft recognizes only frames that came into the LAN
 * directly, while through a repeater or a routed segment the packet has a
 * foreign MAC and the original IP. An entry that already exists is not
 * duplicated: in an nft set an address next to the same `/32` subnet gives an
 * interval overlap.
 *
 * Turning off removes both the MAC and the address in both forms, otherwise the
 * device would stay intercepted by the second entry. A device inside a subnet
 * from the list is then written into the exclusions by the same rule: the MAC,
 * and the address for a static lease.
 *
 * Turning on removes the device from the exclusions; inside a subnet nothing
 * else is written, the subnet already intercepts it. An exclusion wider than
 * the device stays: `routeReason` names it, and the toggle is not offered.
 */
export function withDeviceRoute(model: DataplaneModel, source: RouteSource, routed: boolean): DataplaneModel {
  const sourceMac = model.sourceMac.filter((mac) => !sameMac(mac, source.mac));
  const sourceIp = model.sourceIp.filter((ip) => !isHostOf(ip, source.ip));
  const sourceMacExclude = model.sourceMacExclude.filter((mac) => !sameMac(mac, source.mac));
  const sourceIpExclude = model.sourceIpExclude.filter((ip) => !isHostOf(ip, source.ip));
  const host = source.static && source.ip !== '' ? [`${source.ip}${HOST_PREFIX}`] : [];
  const inSubnet = subnetOf(sourceIp, source.ip) !== null;

  if (!routed) {
    return inSubnet
      ? {
          ...model,
          sourceMac,
          sourceIp,
          sourceMacExclude: source.mac === '' ? sourceMacExclude : [...sourceMacExclude, source.mac],
          sourceIpExclude: [...sourceIpExclude, ...host],
        }
      : { ...model, sourceMac, sourceIp, sourceMacExclude, sourceIpExclude };
  }

  if (inSubnet) return { ...model, sourceMacExclude, sourceIpExclude };

  return {
    ...model,
    sourceMac: source.mac === '' ? sourceMac : [...sourceMac, source.mac],
    sourceIp: host.length > 0 ? [...sourceIp, ...host] : model.sourceIp,
    sourceMacExclude,
    sourceIpExclude,
  };
}
