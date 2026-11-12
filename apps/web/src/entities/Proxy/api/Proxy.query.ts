import { queryOptions, useMutationState, useQuery, type Mutation } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { CACHE_TIME, decodeResponse } from '@shared/api';

import { toFailedProbes, toProxyProviders, toProxyRuntime } from '../model/Proxy.adapter';
import type { ProbeOutcome } from '../model/Proxy.model';
import { getProxies, getProxyProviders } from './Proxy.api';
import { ClashProvidersSchema, ClashProxiesSchema, type ClashProxiesWire } from './Proxy.schema';

export const PROXY_QUERY = {
  all: ['proxy'] as const,
  list: () => [...PROXY_QUERY.all, 'list'] as const,
  providers: () => [...PROXY_QUERY.all, 'providers'] as const,
} as const;

export const PROXY_MUTATION = {
  /** A delay probe: its outcomes are the only source of "did not answer", see `ProbeOutcome`. */
  delay: () => [...PROXY_QUERY.all, 'delay'] as const,
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

function toProbeOutcome(mutation: Mutation): ProbeOutcome | null {
  const data = mutation.state.data;

  if (typeof data !== 'object' || data === null || !('name' in data) || !('failed' in data)) {
    return null;
  }

  return typeof data.name === 'string' && typeof data.failed === 'boolean'
    ? { name: data.name, failed: data.failed }
    : null;
}

/** Probe outcomes are kept in the mutation cache: they are responses, not client state. */
function useFailedProbes(): ReadonlySet<string> {
  const outcomes = useMutationState({
    filters: { mutationKey: PROXY_MUTATION.delay(), status: 'success' },
    select: toProbeOutcome,
  });

  return useMemo(
    () => toFailedProbes(outcomes.filter((outcome): outcome is ProbeOutcome => outcome !== null)),
    [outcomes]
  );
}

export function useProxies() {
  const failed = useFailedProbes();
  const select = useCallback((wire: ClashProxiesWire) => toProxyRuntime(wire, failed), [failed]);

  return useQuery({ ...getProxiesOptions(), select });
}

export function useProxyProviders() {
  return useQuery({ ...getProxyProvidersOptions(), select: toProxyProviders });
}
