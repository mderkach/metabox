import { describe, expect, it } from 'vitest';

import { toHostAddress, toRuleCaption } from '../model/Rule.caption';

describe('toHostAddress', () => {
  it.each([
    ['192.168.1.60/32', '192.168.1.60'],
    ['fd00::60/128', 'fd00::60'],
  ])('%s is one host', (value, address) => {
    expect(toHostAddress(value)).toBe(address);
  });

  it.each([
    '192.168.1.60',
    'fd00::60',
    '192.168.1.0/31',
    '192.168.1.0/24',
    'fd00::/32',
    'fd00::60/127',
    'fd00::/64',
    '192.168.1.60/128',
  ])('%s stays as is', (value) => {
    expect(toHostAddress(value)).toBe(value);
  });
});

describe('toRuleCaption by source device', () => {
  const devices: Record<string, string> = { '192.168.1.60': 'TV', 'fd00::60': 'TV6' };
  const deviceOf = (address: string) => devices[address] ?? null;
  const caption = (value: string) =>
    toRuleCaption({ matchers: [{ key: 'source_ip_cidr', values: [value] }], group: null }, deviceOf);

  it('names the device of a one-host condition of either family', () => {
    expect(caption('192.168.1.60/32').condition).toBe('TV');
    expect(caption('fd00::60/128').condition).toBe('TV6');
  });

  it('keeps an IPv6 /32 network as a network', () => {
    expect(caption('fd00::/32').condition).toBe('fd00::/32');
  });
});
