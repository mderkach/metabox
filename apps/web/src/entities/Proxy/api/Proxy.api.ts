import type { AxiosRequestConfig } from 'axios';

import { ApiClientInstance, TIMEOUT } from '@shared/api';

import { PROXY_ENDPOINT } from './Proxy.endpoints';
import type { ClashDelayWire, ClashProvidersWire, ClashProxiesWire } from './Proxy.schema';

/**
 * Target and wait ceiling for a probe. The Clash API considers them required
 * and answers `400 Body invalid` without them; the address is the same one
 * sing-box uses to probe nodes in `urltest`.
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
 * Reread a subscription now, without waiting for its interval. A subscription
 * without an update source (file, inline) answers with success and does not
 * change.
 */
export async function updateProxyProvider(name: string, config?: AxiosRequestConfig): Promise<void> {
  await ApiClientInstance.put<void>(PROXY_ENDPOINT.provider(name), undefined, config);
}

/**
 * Node selection in a selector group. The config does not change: the selection
 * lives in the sing-box runtime and survives only until the service restarts.
 */
export async function selectProxy(group: string, node: string, config?: AxiosRequestConfig): Promise<void> {
  await ApiClientInstance.put<void>(PROXY_ENDPOINT.proxy(group), { name: node }, config);
}

/** Node latency check; `65535` in the response means "did not answer". */
export async function testProxyDelay(name: string, config?: AxiosRequestConfig): Promise<ClashDelayWire> {
  return ApiClientInstance.get<ClashDelayWire>(PROXY_ENDPOINT.proxyDelay(name), {
    ...config,
    params: DELAY_PROBE,
  });
}
