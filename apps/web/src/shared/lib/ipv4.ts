export const IPV4_HOST_PREFIX = 32;
const IPV4_OCTET_MAX = 255;
const IPV4_OCTETS = 4;
const OCTET_BITS = 8;
const IPV4_CIDR = /^(\d{1,3}(?:\.\d{1,3}){3})(?:\/(\d{1,2}))?$/;

/** IPv4 address or subnet; the address is an unsigned 32-bit number. */
export interface Ipv4Cidr {
  address: number;
  prefix: number;
}

/** Parses a bare IPv4 address as a one-host subnet. */
export function parseIpv4Cidr(entry: string): Ipv4Cidr | null {
  const match = IPV4_CIDR.exec(entry);

  if (match === null) return null;

  // An optional group without a match is `undefined`, although the RegExp type promises a string.
  const [, address = '', length = ''] = match;
  const octets = address.split('.').map(Number);
  const prefix = length === '' ? IPV4_HOST_PREFIX : Number(length);

  if (octets.some((octet) => octet > IPV4_OCTET_MAX) || prefix > IPV4_HOST_PREFIX) return null;

  return { address: octets.reduce((value, octet) => value * (IPV4_OCTET_MAX + 1) + octet, 0), prefix };
}

/** The address falls into the subnet. The mask drops host bits: `192.168.1.67/29` reads as `192.168.1.64/29`. */
export function cidrContains(cidr: Ipv4Cidr, address: number): boolean {
  const mask = maskOf(cidr.prefix);

  return (cidr.address & mask) >>> 0 === (address & mask) >>> 0;
}

function maskOf(prefix: number): number {
  return prefix === 0 ? 0 : (~0 << (IPV4_HOST_PREFIX - prefix)) >>> 0;
}

export function formatIpv4(address: number): string {
  return Array.from({ length: IPV4_OCTETS }, (_, index) =>
    String((address >>> ((IPV4_OCTETS - 1 - index) * OCTET_BITS)) & IPV4_OCTET_MAX)
  ).join('.');
}

export function ipv4NetworkAddress(cidr: Ipv4Cidr): number {
  return (cidr.address & maskOf(cidr.prefix)) >>> 0;
}
