/** LAN device addresses. The MAC in the path is encoded: colons are part of the address, not a separator. */
export const DEVICE_ENDPOINT = {
  devices: () => '/api/devices',
  device: (mac: string) => `/api/devices/${encodeURIComponent(mac)}`,
} as const;
