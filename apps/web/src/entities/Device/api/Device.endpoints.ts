/** Адреса устройств LAN. MAC в пути кодируется: двоеточия — часть адреса, а не разделитель. */
export const DEVICE_ENDPOINT = {
  devices: () => '/api/devices',
  device: (mac: string) => `/api/devices/${encodeURIComponent(mac)}`,
} as const;
