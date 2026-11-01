import { describe, expect, it } from 'vitest';

import { toDataplane, toDataplaneChange } from '../model/Dataplane.adapter';
import {
  cidrContains,
  isRouted,
  parseIpv4Cidr,
  ROUTE_REASON,
  routeReason,
  SOURCE_IP_ERROR,
  sourceIpError,
  withDeviceRoute,
  type RouteSource,
} from '../model/Dataplane.model';
import { DATAPLANE_FIXTURE } from './Dataplane.fixture';

const MODEL = toDataplane({ body: DATAPLANE_FIXTURE, etag: null }).model;

const DYNAMIC: RouteSource = { mac: 'aa:bb:cc:00:00:40', ip: '192.168.1.36', static: false };
const STATIC: RouteSource = { mac: 'aa:bb:cc:00:00:70', ip: '192.168.1.60', static: true };
const BY_MAC: RouteSource = { mac: 'aa:bb:cc:00:01:04', ip: '192.168.1.120', static: false };
const BY_IP: RouteSource = { mac: 'aa:bb:cc:00:01:60', ip: '192.168.1.180', static: true };

/** Interception list: subnets of different length and one host. */
const ROUTER_SOURCE_IP = [
  '192.168.1.36/32',
  '192.168.1.60/31',
  '192.168.1.64/29',
  '192.168.1.112/28',
  '192.168.1.128/26',
  '192.168.1.192/27',
];

function addressOf(ip: string): number {
  const cidr = parseIpv4Cidr(ip);

  if (cidr === null) {
    throw new Error(`${ip} не разбирается как IPv4`);
  }

  return cidr.address;
}

function contains(cidr: string, ip: string): boolean {
  const parsed = parseIpv4Cidr(cidr);

  return parsed !== null && cidrContains(parsed, addressOf(ip));
}

describe('parseIpv4Cidr', () => {
  it('reads a subnet, and a bare address as a one-host subnet', () => {
    expect(parseIpv4Cidr('192.168.1.64/29')).toEqual({ address: 0xc0_a8_01_40, prefix: 29 });
    expect(parseIpv4Cidr('192.168.1.36')).toEqual({ address: 0xc0_a8_01_24, prefix: 32 });
    expect(parseIpv4Cidr('255.255.255.255/0')).toEqual({ address: 0xff_ff_ff_ff, prefix: 0 });
  });

  it('rejects garbage, an octet above 255 and a prefix longer than 32', () => {
    expect(parseIpv4Cidr('')).toBeNull();
    expect(parseIpv4Cidr('router')).toBeNull();
    expect(parseIpv4Cidr('192.168.1')).toBeNull();
    expect(parseIpv4Cidr('192.168.1.256')).toBeNull();
    expect(parseIpv4Cidr('192.168.1.0/33')).toBeNull();
    expect(parseIpv4Cidr('192.168.1.0/')).toBeNull();
    expect(parseIpv4Cidr(' 192.168.1.0/24')).toBeNull();
  });

  it('does not parse IPv6', () => {
    expect(parseIpv4Cidr('fd00::/8')).toBeNull();
    expect(parseIpv4Cidr('::ffff:192.168.1.36')).toBeNull();
  });
});

describe('cidrContains', () => {
  it('recognizes an address inside a subnet and does not recognize one outside', () => {
    expect(contains('192.168.1.64/29', '192.168.1.64')).toBe(true);
    expect(contains('192.168.1.64/29', '192.168.1.71')).toBe(true);
    expect(contains('192.168.1.64/29', '192.168.1.72')).toBe(false);
    expect(contains('192.168.1.64/29', '192.168.1.63')).toBe(false);
  });

  it('/0 covers everything, /32 exactly one address, /31 two', () => {
    expect(contains('0.0.0.0/0', '10.1.2.3')).toBe(true);
    expect(contains('192.168.1.36/32', '192.168.1.36')).toBe(true);
    expect(contains('192.168.1.36/32', '192.168.1.37')).toBe(false);
    expect(contains('192.168.1.60/31', '192.168.1.61')).toBe(true);
    expect(contains('192.168.1.60/31', '192.168.1.62')).toBe(false);
  });

  it('host bits in the subnet address do not interfere', () => {
    expect(contains('192.168.1.67/29', '192.168.1.64')).toBe(true);
  });

  it('the high address bit does not push the comparison into negative numbers', () => {
    expect(contains('224.0.0.0/4', '239.255.255.250')).toBe(true);
  });
});

describe('routeReason', () => {
  it('recognizes a device by MAC case-insensitively and by an address without a prefix', () => {
    expect(routeReason(MODEL, BY_MAC)).toEqual({ kind: ROUTE_REASON.Mac });
    expect(routeReason(MODEL, BY_IP)).toEqual({ kind: ROUTE_REASON.Host });
    expect(routeReason(MODEL, DYNAMIC)).toBeNull();
  });

  it('a one-host subnet address is a device entry, a wider subnet is the reason "subnet"', () => {
    expect(routeReason({ ...MODEL, sourceIp: ['192.168.1.36/32'] }, DYNAMIC)).toEqual({ kind: ROUTE_REASON.Host });
    expect(routeReason({ ...MODEL, sourceIp: ['192.168.1.0/24'] }, DYNAMIC)).toEqual({
      kind: ROUTE_REASON.Subnet,
      subnet: '192.168.1.0/24',
    });
  });

  it('on a subnet list routes through sing-box by subnet, not only by the /32 host', () => {
    const model = { ...MODEL, sourceIp: ROUTER_SOURCE_IP, sourceMac: [] };

    expect(routeReason(model, DYNAMIC)).toEqual({ kind: ROUTE_REASON.Host });
    expect(routeReason(model, STATIC)).toEqual({ kind: ROUTE_REASON.Subnet, subnet: '192.168.1.60/31' });
    expect(routeReason(model, BY_MAC)).toEqual({ kind: ROUTE_REASON.Subnet, subnet: '192.168.1.112/28' });
    expect(routeReason(model, BY_IP)).toEqual({ kind: ROUTE_REASON.Subnet, subnet: '192.168.1.128/26' });
    expect(routeReason(model, { ...DYNAMIC, ip: '192.168.1.37' })).toBeNull();
  });

  it('an exclusion overrides the subnet, the MAC and the address: the device goes direct', () => {
    const model = { ...MODEL, sourceIp: ['192.168.1.120/32', '192.168.1.112/28'] };
    const excluded = { kind: ROUTE_REASON.Excluded, subnet: '192.168.1.112/28' };

    expect(routeReason(model, BY_MAC)).toEqual({ kind: ROUTE_REASON.Subnet, subnet: '192.168.1.112/28' });
    expect(routeReason({ ...model, sourceMacExclude: ['AA:BB:CC:00:01:04'] }, BY_MAC)).toEqual(excluded);
    expect(routeReason({ ...model, sourceIpExclude: ['192.168.1.120'] }, BY_MAC)).toEqual(excluded);
    expect(routeReason({ ...model, sourceIpExclude: ['192.168.1.120/30'] }, BY_MAC)).toEqual(excluded);
    expect(isRouted(excluded)).toBe(false);
  });

  it('an exclusion outside any subnet is not named: nothing lists the device', () => {
    const model = { ...MODEL, sourceIp: [], sourceMac: ['aa:bb:cc:00:01:04'], sourceMacExclude: ['aa:bb:cc:00:01:04'] };

    expect(routeReason(model, BY_MAC)).toBeNull();
  });

  it('skips garbage and IPv6 in the list', () => {
    const model = { ...MODEL, sourceIp: ['garbage', 'fd00::/8', '192.168.1.0/24'], sourceMac: [] };

    expect(routeReason(model, DYNAMIC)).toEqual({ kind: ROUTE_REASON.Subnet, subnet: '192.168.1.0/24' });
  });

  it('a device without an address matches neither an empty entry nor a subnet', () => {
    const model = { ...MODEL, sourceIp: ['', '0.0.0.0/0'], sourceMac: [] };

    expect(routeReason(model, { ...DYNAMIC, ip: '' })).toBeNull();
  });
});

describe('withDeviceRoute', () => {
  it('for a dynamic lease writes only the MAC', () => {
    const next = withDeviceRoute(MODEL, DYNAMIC, true);

    expect(next.sourceMac).toEqual(['AA:BB:CC:00:01:04', 'aa:bb:cc:00:00:40']);
    expect(next.sourceIp).toEqual(['192.168.1.180']);
  });

  it('for a static lease writes the MAC and the address as a /32 subnet', () => {
    const next = withDeviceRoute(MODEL, STATIC, true);

    expect(next.sourceMac).toContain('aa:bb:cc:00:00:70');
    expect(next.sourceIp).toEqual(['192.168.1.180', '192.168.1.60/32']);
  });

  it('does not duplicate an address already written without a prefix', () => {
    const next = withDeviceRoute(MODEL, BY_IP, true);

    expect(next.sourceIp).toEqual(['192.168.1.180/32']);
  });

  it('disabling removes the MAC in any case and the address in both forms, does not touch subnets', () => {
    const model = { ...MODEL, sourceIp: ['192.168.1.120', '192.168.1.120/32', '10.0.0.0/8'] };
    const next = withDeviceRoute(model, BY_MAC, false);

    expect(next.sourceMac).toEqual([]);
    expect(next.sourceIp).toEqual(['10.0.0.0/8']);
    expect(routeReason(next, BY_MAC)).toBeNull();
  });

  it('disabling a device inside a subnet excludes its MAC, and the address for a static lease', () => {
    const model = { ...MODEL, sourceIp: ['192.168.1.0/24', '192.168.1.60/32'], sourceMac: ['aa:bb:cc:00:00:70'] };

    const dynamic = withDeviceRoute(model, DYNAMIC, false);

    expect(dynamic.sourceMacExclude).toEqual(['aa:bb:cc:00:00:40']);
    expect(dynamic.sourceIpExclude).toEqual([]);

    const fixed = withDeviceRoute(model, STATIC, false);

    expect(fixed.sourceIp).toEqual(['192.168.1.0/24']);
    expect(fixed.sourceMac).toEqual([]);
    expect(fixed.sourceMacExclude).toEqual(['aa:bb:cc:00:00:70']);
    expect(fixed.sourceIpExclude).toEqual(['192.168.1.60/32']);
    expect(isRouted(routeReason(fixed, STATIC))).toBe(false);
  });

  it('disabling a device outside subnets writes no exclusion', () => {
    const next = withDeviceRoute(MODEL, BY_MAC, false);

    expect(next.sourceMacExclude).toEqual([]);
    expect(next.sourceIpExclude).toEqual([]);
  });

  it('enabling an excluded device inside a subnet only removes the exclusion', () => {
    const model = {
      ...MODEL,
      sourceIp: ['192.168.1.0/24'],
      sourceMac: [],
      sourceMacExclude: ['AA:BB:CC:00:00:70', 'aa:bb:cc:00:00:99'],
      sourceIpExclude: ['192.168.1.60', '192.168.1.61/32'],
    };
    const next = withDeviceRoute(model, STATIC, true);

    expect(next.sourceMac).toEqual([]);
    expect(next.sourceIp).toEqual(['192.168.1.0/24']);
    expect(next.sourceMacExclude).toEqual(['aa:bb:cc:00:00:99']);
    expect(next.sourceIpExclude).toEqual(['192.168.1.61/32']);
    expect(routeReason(next, STATIC)).toEqual({ kind: ROUTE_REASON.Subnet, subnet: '192.168.1.0/24' });
  });

  it('enabling an excluded device outside subnets lists it and drops the exclusion', () => {
    const next = withDeviceRoute({ ...MODEL, sourceMacExclude: ['aa:bb:cc:00:00:40'] }, DYNAMIC, true);

    expect(next.sourceMac).toContain('aa:bb:cc:00:00:40');
    expect(next.sourceMacExclude).toEqual([]);
  });

  it('other model fields go to the daemon unchanged', () => {
    expect(toDataplaneChange(withDeviceRoute(MODEL, DYNAMIC, false))).toEqual({ model: DATAPLANE_FIXTURE.model });
  });
});

describe('sourceIpError', () => {
  it('accepts an address and a subnet that starts at its network address', () => {
    expect(sourceIpError('192.168.1.20')).toBeNull();
    expect(sourceIpError('192.168.1.0/24')).toBeNull();
    expect(sourceIpError('0.0.0.0/0')).toBeNull();
    expect(sourceIpError('192.168.1.20/32')).toBeNull();
  });

  it('names the subnet meant by an entry with host bits', () => {
    expect(sourceIpError('192.168.1.5/24')).toEqual({ kind: SOURCE_IP_ERROR.HostBits, subnet: '192.168.1.0/24' });
    expect(sourceIpError('10.1.2.3/8')).toEqual({ kind: SOURCE_IP_ERROR.HostBits, subnet: '10.0.0.0/8' });
    expect(sourceIpError('192.168.1.255/25')).toEqual({ kind: SOURCE_IP_ERROR.HostBits, subnet: '192.168.1.128/25' });
  });

  it('rejects IPv6, garbage and an octet above 255', () => {
    expect(sourceIpError('fd00::1')).toEqual({ kind: SOURCE_IP_ERROR.Invalid });
    expect(sourceIpError('router')).toEqual({ kind: SOURCE_IP_ERROR.Invalid });
    expect(sourceIpError('192.168.1.256')).toEqual({ kind: SOURCE_IP_ERROR.Invalid });
    expect(sourceIpError('')).toEqual({ kind: SOURCE_IP_ERROR.Invalid });
  });
});
