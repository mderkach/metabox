import type { AxiosRequestConfig } from 'axios';

import { ApiClientInstance } from '@shared/api';

import { DEVICE_ENDPOINT } from './Device.endpoints';
import type { DevicesWire } from './Device.schema';

/** Each request without the daemon cache runs `uci` on the router: keep it behind a long `staleTime`. */
export async function getDevices(config?: AxiosRequestConfig): Promise<DevicesWire> {
  return ApiClientInstance.get<DevicesWire>(DEVICE_ENDPOINT.devices(), config);
}

/** An empty name clears its own, and the label returns to the static lease or DHCP. The response is the whole list. */
export async function renameDevice(mac: string, name: string, config?: AxiosRequestConfig): Promise<DevicesWire> {
  return ApiClientInstance.put<DevicesWire>(DEVICE_ENDPOINT.device(mac), { name }, config);
}
