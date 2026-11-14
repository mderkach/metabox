import { describe, expect, it } from 'vitest';

import { toDeviceIndex } from '@entities/Device';
import { DEVICES_FIXTURE } from '@entities/Device/__tests__/Device.fixture';

import { actionOutsideForm, lanSubnets, sourceSuggestions } from '../model/RuleEdit.model';
import { RULE_ACTION } from '../model/RuleEdit.schema';

describe('rule action outside the form', () => {
  it('names an action the form does not edit', () => {
    expect(actionOutsideForm({ domain: ['example.com'], action: 'resolve', server: 'local' })).toBe('resolve');
    expect(actionOutsideForm({ domain: ['example.com'], action: 'bypass', outbound: 'proxy' })).toBe('bypass');
  });

  it('lets the form open a rule without an action key or with its own action', () => {
    expect(actionOutsideForm({ domain: ['example.com'], outbound: 'proxy' })).toBeNull();
    expect(actionOutsideForm({ domain: ['example.com'], action: RULE_ACTION.Sniff })).toBeNull();
    expect(actionOutsideForm(undefined)).toBeNull();
  });
});

describe('local network subnets', () => {
  it('groups device addresses into subnets in address order and skips IPv6', () => {
    const devices = toDeviceIndex({
      devices: [
        { ...DEVICES_FIXTURE.devices[0], ip: '192.168.10.5' },
        { ...DEVICES_FIXTURE.devices[0], ip: '192.168.1.60' },
        { ...DEVICES_FIXTURE.devices[0], ip: '192.168.1.36' },
        { ...DEVICES_FIXTURE.devices[0], ip: 'fd00::5' },
      ],
    });

    expect(lanSubnets(devices)).toEqual([
      { cidr: '192.168.1.0/24', devices: 2 },
      { cidr: '192.168.10.0/24', devices: 1 },
    ]);
  });
});

describe('source suggestions', () => {
  const devices = toDeviceIndex({
    devices: [
      { ...DEVICES_FIXTURE.devices[0], ip: '192.168.1.60' },
      { ...DEVICES_FIXTURE.devices[0], ip: '192.168.1.36' },
      { ...DEVICES_FIXTURE.devices[0], ip: '10.0.0.5' },
    ],
  });
  const ips = (offered: ReturnType<typeof sourceSuggestions>) => ({
    devices: offered.devices.map((device) => device.ip),
    networks: offered.networks.map((network) => network.cidr),
  });

  it('offers every device and network next to unrelated chips', () => {
    expect(ips(sourceSuggestions(devices, ['172.16.0.0/12']))).toEqual({
      devices: ['192.168.1.60', '192.168.1.36', '10.0.0.5'],
      networks: ['10.0.0.0/24', '192.168.1.0/24'],
    });
  });

  it('does not offer a network around a device chip or the device itself', () => {
    expect(ips(sourceSuggestions(devices, ['192.168.1.60/32']))).toEqual({
      devices: ['192.168.1.36', '10.0.0.5'],
      networks: ['10.0.0.0/24'],
    });
  });

  it('does not offer a device inside a network chip', () => {
    expect(ips(sourceSuggestions(devices, ['10.0.0.0/8', 'not an address']))).toEqual({
      devices: ['192.168.1.60', '192.168.1.36'],
      networks: ['192.168.1.0/24'],
    });
  });
});
