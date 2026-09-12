import type { AxiosRequestConfig } from 'axios';

import { ApiClientInstance } from '@shared/api';

import type { ClashDelay, ClashProviders, ClashProxies } from './Proxy.dto';
import { PROXY_ENDPOINT } from './Proxy.endpoints';

export async function getProxies(config?: AxiosRequestConfig): Promise<ClashProxies> {
  return ApiClientInstance.get<ClashProxies>(PROXY_ENDPOINT.proxies(), config);
}

export async function getProxyProviders(config?: AxiosRequestConfig): Promise<ClashProviders> {
  return ApiClientInstance.get<ClashProviders>(PROXY_ENDPOINT.providers(), config);
}

/**
 * Выбор узла в группе-селекторе. Конфиг при этом не меняется: выбор живёт в
 * рантайме sing-box и переживает только до перезапуска сервиса.
 */
export async function selectProxy(group: string, node: string, config?: AxiosRequestConfig): Promise<void> {
  await ApiClientInstance.put<void>(PROXY_ENDPOINT.proxy(group), { name: node }, config);
}

/** Проверка задержки узла; `65535` в ответе значит «не ответил». */
export async function testProxyDelay(name: string, config?: AxiosRequestConfig): Promise<ClashDelay> {
  return ApiClientInstance.get<ClashDelay>(PROXY_ENDPOINT.proxyDelay(name), config);
}
