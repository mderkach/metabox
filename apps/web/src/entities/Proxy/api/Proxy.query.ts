import { queryOptions, useQuery } from '@tanstack/react-query';

import { CACHE_TIME, decodeResponse } from '@shared/api';

import { toProxyProviders, toProxyRuntime } from '../model/Proxy.adapter';
import { getProxies, getProxyProviders } from './Proxy.api';
import { ClashProvidersSchema, ClashProxiesSchema } from './Proxy.schema';

export const PROXY_QUERY = {
  all: ['proxy'] as const,
  list: () => [...PROXY_QUERY.all, 'list'] as const,
  providers: () => [...PROXY_QUERY.all, 'providers'] as const,
} as const;

export function getProxiesOptions() {
  return queryOptions({
    queryKey: PROXY_QUERY.list(),
    queryFn: async (context) => decodeResponse(ClashProxiesSchema, await getProxies(context), 'proxies'),
    staleTime: CACHE_TIME.Second,
    gcTime: CACHE_TIME.Minute,
    meta: { showError: true, errorMessageKey: 'source.proxies' },
  });
}

export function getProxyProvidersOptions() {
  return queryOptions({
    queryKey: PROXY_QUERY.providers(),
    queryFn: async (context) =>
      decodeResponse(ClashProvidersSchema, await getProxyProviders(context), 'proxy providers'),
    staleTime: CACHE_TIME.Minute,
    gcTime: CACHE_TIME.Hour,
    meta: { showError: true, errorMessageKey: 'source.providers' },
  });
}

export function useProxies() {
  return useQuery({ ...getProxiesOptions(), select: toProxyRuntime });
}

export function useProxyProviders() {
  return useQuery({ ...getProxyProvidersOptions(), select: toProxyProviders });
}
