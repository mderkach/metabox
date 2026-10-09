import type { AxiosRequestConfig } from 'axios';

import { ApiClientInstance } from '@shared/api';

import { DEVICE_ENDPOINT } from './Device.endpoints';
import type { DevicesWire } from './Device.schema';

/** Каждый запрос без кэша демона запускает `uci` на роутере: держать его за долгим `staleTime`. */
export async function getDevices(config?: AxiosRequestConfig): Promise<DevicesWire> {
  return ApiClientInstance.get<DevicesWire>(DEVICE_ENDPOINT.devices(), config);
}

/** Пустое имя снимает своё, и подпись возвращается к статической аренде или DHCP. Ответ — список целиком. */
export async function renameDevice(mac: string, name: string, config?: AxiosRequestConfig): Promise<DevicesWire> {
  return ApiClientInstance.put<DevicesWire>(DEVICE_ENDPOINT.device(mac), { name }, config);
}
