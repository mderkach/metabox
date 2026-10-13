import { describe, expect, it } from 'vitest';

import { MS_IN_MINUTE, MS_IN_SECOND, SECONDS_IN_HOUR, SECONDS_IN_MINUTE } from '@shared/lib/time';

import { DevicesSchema } from '../api/Device.schema';
import { toDeviceIndex, toDevices } from '../model/Device.adapter';
import { deviceLabel, EMPTY_DEVICE_INDEX, leaseLeft } from '../model/Device.model';
import { DEVICES_FIXTURE } from './Device.fixture';

describe('device label', () => {
  const index = toDeviceIndex(DEVICES_FIXTURE);

  it('takes the name the daemon chose by priority', () => {
    expect(deviceLabel('192.168.1.60', index)).toBe('Ноутбук');
    expect(deviceLabel('192.168.1.180', index)).toBe('tv-living');
    expect(deviceLabel('192.168.1.120', index)).toBe('iphone-guest');
  });

  it('labels a device without a name by the address', () => {
    expect(deviceLabel('192.168.1.36', index)).toBe('192.168.1.36');
  });

  it('an unknown address and an empty index leave the address', () => {
    expect(deviceLabel('10.0.0.5', index)).toBe('10.0.0.5');
    expect(deviceLabel('192.168.1.60', EMPTY_DEVICE_INDEX)).toBe('192.168.1.60');
  });
});

describe('device adapter', () => {
  it('keeps the daemon order and labels a device without an address by its MAC', () => {
    const devices = toDevices({
      devices: [{ ...DEVICES_FIXTURE.devices[0], ip: '', name: '' }],
    });

    expect(devices[0].label).toBe('aa:bb:cc:00:00:40');
  });

  it('reads a zero lease end as "no lease", not as the year 1970', () => {
    const [dynamic, custom] = toDevices(DEVICES_FIXTURE);

    expect(dynamic.leaseExpires).toEqual(new Date(1_791_000_000_000));
    expect(custom.leaseExpires).toBeNull();
  });

  it('does not put a device without an address into the address index', () => {
    const index = toDeviceIndex(DEVICES_FIXTURE);

    expect(index.has('')).toBe(false);
    expect(index.size).toBe(DEVICES_FIXTURE.devices.length - 1);
  });

  it('the response schema accepts the fixture and rejects a device without a MAC', () => {
    expect(DevicesSchema.safeParse(DEVICES_FIXTURE).success).toBe(true);

    const { mac: _mac, ...withoutMac } = DEVICES_FIXTURE.devices[0];

    expect(DevicesSchema.safeParse({ devices: [withoutMac] }).success).toBe(false);
  });
});

describe('lease remainder', () => {
  const expires = new Date(1_791_000_000 * MS_IN_SECOND);
  const dynamic = { static: false, leaseExpires: expires };

  it('computes the dynamic lease remainder rounding up to the minute', () => {
    const now = expires.getTime() - (3 * SECONDS_IN_HOUR + 1) * MS_IN_SECOND;

    expect(leaseLeft(dynamic, now)).toBe(3 * SECONDS_IN_HOUR + SECONDS_IN_MINUTE);
    expect(leaseLeft(dynamic, expires.getTime() - MS_IN_SECOND)).toBe(SECONDS_IN_MINUTE);
    expect(leaseLeft(dynamic, expires.getTime() - MS_IN_MINUTE)).toBe(SECONDS_IN_MINUTE);
  });

  it('a static lease has no remainder: the address is pinned', () => {
    expect(leaseLeft({ ...dynamic, static: true }, 0)).toBeNull();
  });

  it('without a lease and after its end there is no remainder', () => {
    expect(leaseLeft({ static: false, leaseExpires: null }, 0)).toBeNull();
    expect(leaseLeft(dynamic, expires.getTime())).toBeNull();
    expect(leaseLeft(dynamic, expires.getTime() + MS_IN_MINUTE)).toBeNull();
  });
});
