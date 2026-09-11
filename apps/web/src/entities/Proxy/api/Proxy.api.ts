import type { AxiosRequestConfig } from 'axios';

import { API_ENDPOINT, ApiClientInstance } from '@shared/api';

import type { ClashDelay, ClashProviders, ClashProxies } from './Proxy.dto';

export async function getProxies(config?: AxiosRequestConfig): Promise<ClashProxies> {
  return ApiClientInstance.get<ClashProxies>(API_ENDPOINT.clashProxies(), config);
}

export async function getProxyProviders(config?: AxiosRequestConfig): Promise<ClashProviders> {
  return ApiClientInstance.get<ClashProviders>(API_ENDPOINT.clashProviders(), config);
}

/**
 * Выбор узла в группе-селекторе. Конфиг при этом не меняется: выбор живёт в
 * рантайме sing-box и переживает только до перезапуска сервиса.
 */
export async function selectProxy(group: string, node: string, config?: AxiosRequestConfig): Promise<void> {
  await ApiClientInstance.put<void>(API_ENDPOINT.clashProxy(group), { name: node }, config);
}

/** Проверка задержки узла; `65535` в ответе значит «не ответил». */
export async function testProxyDelay(name: string, config?: AxiosRequestConfig): Promise<ClashDelay> {
  return ApiClientInstance.get<ClashDelay>(API_ENDPOINT.clashProxyDelay(name), config);
}
