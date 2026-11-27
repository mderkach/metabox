import { describe, expect, it } from 'vitest';

import { cidrContains, parseIpv4Cidr } from '../ipv4';

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
