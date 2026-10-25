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
  if (cidr.prefix === 0) return true;

  const mask = (~0 << (IPV4_BITS - cidr.prefix)) >>> 0;

  return (cidr.address & mask) >>> 0 === (address & mask) >>> 0;
}

function sameMac(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

/** The address is written in `source_ip` by itself or as a one-host subnet; the daemon accepts both forms. */
function isHostOf(entry: string, ip: string): boolean {
  return ip !== '' && (entry === ip || entry === `${ip}${HOST_PREFIX}`);
}

/** A subnet wider than one host that contains the address. */
function subnetOf(entries: readonly string[], ip: string): string | null {
  const address = parseIpv4Cidr(ip);

  if (address === null || address.prefix !== IPV4_BITS) return null;

  return (
    entries.find((entry) => {
      const cidr = parseIpv4Cidr(entry);

      return cidr !== null && cidr.prefix < IPV4_BITS && cidrContains(cidr, address.address);
    }) ?? null
  );
}

export const ROUTE_REASON = {
  Mac: 'mac',
  Host: 'host',
  Subnet: 'subnet',
} as const;

/** Why a device goes through sing-box in `listed` mode. */
export type RouteReason =
  | { kind: typeof ROUTE_REASON.Mac }
  | { kind: typeof ROUTE_REASON.Host }
  | { kind: typeof ROUTE_REASON.Subnet; subnet: string };

/**
 * The subnet is checked first: a device in it stays intercepted even if its MAC
 * and address are removed, so only it honestly answers whether the device can
 * be turned off separately.
 */
export function routeReason(model: DataplaneModel, source: RouteSource): RouteReason | null {
  const subnet = subnetOf(model.sourceIp, source.ip);

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
 * device would stay intercepted by the second entry.
 */
export function withDeviceRoute(model: DataplaneModel, source: RouteSource, routed: boolean): DataplaneModel {
  const sourceMac = model.sourceMac.filter((mac) => !sameMac(mac, source.mac));
  const sourceIp = model.sourceIp.filter((ip) => !isHostOf(ip, source.ip));

  if (!routed) {
    return { ...model, sourceMac, sourceIp };
  }

  const withIp = source.static && source.ip !== '';

  return {
    ...model,
    sourceMac: [...sourceMac, source.mac],
    sourceIp: withIp ? [...sourceIp, `${source.ip}${HOST_PREFIX}`] : model.sourceIp,
  };
}
