import type { AxiosRequestConfig } from 'axios';

import { ApiClientInstance, TIMEOUT } from '@shared/api';

import { PROXY_ENDPOINT } from './Proxy.endpoints';
import type { ClashDelayWire, ClashProvidersWire, ClashProxiesWire } from './Proxy.schema';

/**
 * Цель и потолок ожидания для замера. Clash API считает их обязательными и
 * отвечает `400 Body invalid`, если их нет; адрес тот же, которым sing-box
 * меряет узлы в `urltest`.
 */
const DELAY_PROBE = {
  url: 'https://www.gstatic.com/generate_204',
  timeout: TIMEOUT.Probe,
} as const;

export async function getProxies(config?: AxiosRequestConfig): Promise<ClashProxiesWire> {
  return ApiClientInstance.get<ClashProxiesWire>(PROXY_ENDPOINT.proxies(), config);
}

export async function getProxyProviders(config?: AxiosRequestConfig): Promise<ClashProvidersWire> {
  return ApiClientInstance.get<ClashProvidersWire>(PROXY_ENDPOINT.providers(), config);
}

/**
 * Выбор узла в группе-селекторе. Конфиг при этом не меняется: выбор живёт в
 * рантайме sing-box и переживает только до перезапуска сервиса.
 */
export async function selectProxy(group: string, node: string, config?: AxiosRequestConfig): Promise<void> {
  await ApiClientInstance.put<void>(PROXY_ENDPOINT.proxy(group), { name: node }, config);
}

/** Проверка задержки узла; `65535` в ответе значит «не ответил». */
export async function testProxyDelay(name: string, config?: AxiosRequestConfig): Promise<ClashDelayWire> {
  return ApiClientInstance.get<ClashDelayWire>(PROXY_ENDPOINT.proxyDelay(name), {
    ...config,
    params: DELAY_PROBE,
  });
}
