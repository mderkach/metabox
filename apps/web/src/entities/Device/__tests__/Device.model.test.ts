import { describe, expect, it } from 'vitest';

import { DevicesSchema } from '../api/Device.schema';
import { toDeviceIndex, toDevices } from '../model/Device.adapter';
import { deviceLabel, EMPTY_DEVICE_INDEX } from '../model/Device.model';
import { DEVICES_FIXTURE } from './Device.fixture';

describe('подпись устройства', () => {
  const index = toDeviceIndex(DEVICES_FIXTURE);

  it('берёт имя, которое демон выбрал по приоритету', () => {
    expect(deviceLabel('192.168.1.60', index)).toBe('Ноутбук');
    expect(deviceLabel('192.168.1.180', index)).toBe('tv-living');
    expect(deviceLabel('192.168.1.120', index)).toBe('iphone-guest');
  });

  it('устройство без имени подписывает адресом', () => {
    expect(deviceLabel('192.168.1.36', index)).toBe('192.168.1.36');
  });

  it('незнакомый адрес и пустой индекс оставляют адрес', () => {
    expect(deviceLabel('10.0.0.5', index)).toBe('10.0.0.5');
    expect(deviceLabel('192.168.1.60', EMPTY_DEVICE_INDEX)).toBe('192.168.1.60');
  });
});

describe('адаптер устройств', () => {
  it('сохраняет порядок демона и подписывает устройство без адреса его MAC', () => {
    const devices = toDevices({
      devices: [{ ...DEVICES_FIXTURE.devices[0], ip: '', name: '' }],
    });

    expect(devices[0].label).toBe('aa:bb:cc:00:00:40');
  });

  it('нулевой конец аренды читает как «аренды нет», а не как 1970 год', () => {
    const [dynamic, custom] = toDevices(DEVICES_FIXTURE);

    expect(dynamic.leaseExpires).toEqual(new Date(1_791_000_000_000));
    expect(custom.leaseExpires).toBeNull();
  });

  it('в индекс по адресу не кладёт устройство без адреса', () => {
    const index = toDeviceIndex(DEVICES_FIXTURE);

    expect(index.has('')).toBe(false);
    expect(index.size).toBe(DEVICES_FIXTURE.devices.length - 1);
  });

  it('схема ответа принимает фикстуру и отклоняет устройство без MAC', () => {
    expect(DevicesSchema.safeParse(DEVICES_FIXTURE).success).toBe(true);

    const { mac: _mac, ...withoutMac } = DEVICES_FIXTURE.devices[0];

    expect(DevicesSchema.safeParse({ devices: [withoutMac] }).success).toBe(false);
  });
});
