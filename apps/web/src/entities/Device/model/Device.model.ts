import { MS_IN_MINUTE, SECONDS_IN_MINUTE } from '@shared/lib/time';

import { NAME_SOURCE } from '../api/Device.schema';

export { NAME_SOURCE };

export type NameSource = (typeof NAME_SOURCE)[number];

export interface Device {
  /** Empty when there is no address either in a lease or in a static entry: the device has only its own name. */
  ip: string;
  /** Lowercase with colons: the daemon stores its own name by it. */
  mac: string;
  /** Label by the daemon priority; empty when there is no name in any source. */
  name: string;
  /** Where the label came from. A string, not `NameSource`: a value the panel does not know is shown as it came. */
  nameSource: string;
  /** The address is pinned to the device by a static entry in `/etc/config/dhcp`. */
  static: boolean;
  online: boolean;
  /** Lease end; `null` means there is no lease or it is perpetual. */
  leaseExpires: Date | null;
  /** How the device is labeled in the panel; see `toDeviceLabel`. */
  label: string;
}

/** Devices by address: this is how a connection source finds its label. */
export type DeviceIndex = ReadonlyMap<string, Device>;

export const EMPTY_DEVICE_INDEX: DeviceIndex = new Map();

export function isNameSource(value: string): value is NameSource {
  return NAME_SOURCE.some((source) => source === value);
}

/**
 * Device label. The priority "own name → static lease → DHCP" is computed by
 * the daemon, which serves the winner in `name`; the panel adds only the
 * fallback steps: the address, and for a device without an address, the MAC.
 */
export function toDeviceLabel(device: Pick<Device, 'ip' | 'mac' | 'name'>): string {
  if (device.name !== '') {
    return device.name;
  }

  return device.ip === '' ? device.mac : device.ip;
}

/**
 * Connection source label is the only point that translates an address into a
 * name; the places where it is used are listed by the `Device.places` test. An
 * unfamiliar address stays an address.
 */
export function deviceLabel(ip: string, devices: DeviceIndex): string {
  return devices.get(ip)?.label ?? ip;
}

/**
 * Remaining dynamic lease time in seconds, rounded up to a minute: the list is
 * not updated more precisely. `null` means there is no remainder: the address
 * is pinned, there is no lease now, or it has already expired.
 */
export function leaseLeft(device: Pick<Device, 'static' | 'leaseExpires'>, now: number): number | null {
  if (device.static || device.leaseExpires === null) {
    return null;
  }

  const left = device.leaseExpires.getTime() - now;

  return left > 0 ? Math.ceil(left / MS_IN_MINUTE) * SECONDS_IN_MINUTE : null;
}
