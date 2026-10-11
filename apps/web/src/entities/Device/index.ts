export { DEVICE_ENDPOINT } from './api/Device.endpoints';
export { DEVICE_QUERY, getDevicesOptions, saveDeviceName, useDeviceIndex, useDevices } from './api/Device.query';
export { toDeviceIndex, toDevices } from './model/Device.adapter';
export { deviceLabel, EMPTY_DEVICE_INDEX, isNameSource, leaseLeft, NAME_SOURCE } from './model/Device.model';
export type { Device, DeviceIndex, NameSource } from './model/Device.model';
