import { describe, expect, it } from 'vitest';

import { compareRouteConditions, parseRuleAddress } from '../model/Rule.conditions';

const DEVICE = '192.0.2.1';
const GENERAL = { domain_suffix: 'example.org', outbound: 'home' };
const SET = { rule_set: 'video', outbound: 'home' };

describe('route conditions', () => {
  it.each([
    'https://example.org',
    'example.org..',
    '192.168.999.3',
    'example.org/path',
    '192.0.2.1/28',
    '*.example.org',
  ])('refuses %s as a single domain or literal IP address', (address) => {
    expect(parseRuleAddress(address)).toBeNull();
  });

  it('distinguishes opaque set membership, broader domains, disjoint devices and equivalent IPv6 literals', () => {
    expect(compareRouteConditions(SET, GENERAL)).toBe('unknown');
    expect(compareRouteConditions(GENERAL, { domain: 'www.example.org', outbound: 'away' })).toBe('covers');
    expect(compareRouteConditions(GENERAL, { domain: 'notexample.org', outbound: 'away' })).toBe('disjoint');
    expect(compareRouteConditions({ ...SET, source_ip_cidr: DEVICE }, { ...SET, source_ip_cidr: '192.0.2.2' })).toBe(
      'disjoint'
    );
    expect(
      compareRouteConditions(
        { ip_cidr: '2001:db8:0::1', outbound: 'away' },
        { ip_cidr: '2001:db8::1', outbound: 'home' }
      )
    ).toBe('covers');
  });
});
