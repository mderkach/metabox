import type { DevicesWire } from '../api/Device.schema';

/**
 * Devices on the connection fixture addresses: each source of the label priority
 * and a device without a name, which is labeled by its address.
 */
export const DEVICES_FIXTURE: DevicesWire = {
  devices: [
    {
      ip: '192.168.1.36',
      mac: 'aa:bb:cc:00:00:40',
      name: '',
      name_source: 'none',
      static: false,
      online: true,
      lease_expires: 1_791_000_000,
    },
    {
      ip: '192.168.1.60',
      mac: 'aa:bb:cc:00:00:70',
      name: 'Ноутбук',
      name_source: 'custom',
      static: true,
      online: true,
      lease_expires: 0,
    },
    {
      ip: '192.168.1.120',
      mac: 'aa:bb:cc:00:01:04',
      name: 'iphone-guest',
      name_source: 'dhcp',
      static: false,
      online: true,
      lease_expires: 1_791_000_000,
    },
    {
      ip: '192.168.1.180',
      mac: 'aa:bb:cc:00:01:60',
      name: 'tv-living',
      name_source: 'static',
      static: true,
      online: false,
      lease_expires: 0,
    },
    {
      ip: '',
      mac: 'aa:bb:cc:00:0f:ff',
      name: 'Принтер',
      name_source: 'custom',
      static: false,
      online: false,
      lease_expires: 0,
    },
  ],
};
