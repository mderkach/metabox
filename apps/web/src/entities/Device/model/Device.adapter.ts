import { MS_IN_SECOND } from '@shared/lib/time';

import type { DevicesWire, DeviceWire } from '../api/Device.schema';
import { toDeviceLabel, type Device, type DeviceIndex } from './Device.model';

function toDevice(wire: DeviceWire): Device {
  return {
    ip: wire.ip,
    mac: wire.mac,
    name: wire.name,
    nameSource: wire.name_source,
    static: wire.static,
    online: wire.online,
    leaseExpires: wire.lease_expires === 0 ? null : new Date(wire.lease_expires * MS_IN_SECOND),
    label: toDeviceLabel(wire),
  };
}

/** The daemon order is kept: by address, those without an address at the end. */
export function toDevices(wire: DevicesWire): Device[] {
  return wire.devices.map(toDevice);
}

/** A device without an address does not get into the index: it cannot be a connection source. */
export function toDeviceIndex(wire: DevicesWire): DeviceIndex {
  const index = new Map<string, Device>();

  for (const device of wire.devices) {
    if (device.ip !== '' && !index.has(device.ip)) {
      index.set(device.ip, toDevice(device));
    }
  }

  return index;
}
