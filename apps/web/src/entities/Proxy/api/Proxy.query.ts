import { queryOptions, useMutationState, useQuery, type Mutation } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { CACHE_TIME, decodeResponse } from '@shared/api';
import { LatencyHistorySchema } from '@shared/api/daemon.generated';

import { toFailedProbes, toProxyProviders, toProxyRuntime } from '../model/Proxy.adapter';
import { LATENCY_LEVEL, toServerLatencies } from '../model/Proxy.latency';
import type { ProbeOutcome } from '../model/Proxy.model';
import { getProxies, getProxyLatency, getProxyProviders } from './Proxy.api';
import { ClashProvidersSchema, ClashProxiesSchema, type ClashProxiesWire } from './Proxy.schema';

export const PROXY_QUERY = {
  all: ['proxy'] as const,
  list: () => [...PROXY_QUERY.all, 'list'] as const,
  latency: () => [...PROXY_QUERY.all, 'latency'] as const,
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

export function useFailedConfigProbes(configEtag: string | null): ReadonlySet<string> {
  const outcomes = useMutationState({
    filters: { mutationKey: PROXY_MUTATION.delay() },
    select: (mutation) => {
      const name = mutation.state.variables;
      if (typeof name !== 'string') return null;

      const data: unknown = mutation.state.data;
      const outcome = mutation.state.status === 'success' ? toProbeOutcome(mutation) : null;
      const revision =
        typeof data === 'object' && data !== null && 'configEtag' in data && typeof data.configEtag === 'string'
          ? data.configEtag
          : null;

      return { name, failed: outcome?.failed === true, revision };
    },
  });

  return useMemo(
    () =>
      toFailedProbes(
        outcomes
          .filter((outcome) => outcome !== null)
          .map(({ name, failed, revision }) => ({
            name,
            failed: failed && configEtag !== null && revision === configEtag,
          }))
      ),
    [configEtag, outcomes]
  );
}

export function useProxies() {
  const failed = useFailedProbes();
  const select = useCallback((wire: ClashProxiesWire) => toProxyRuntime(wire, failed), [failed]);

  return useQuery({ ...getProxiesOptions(), select });
}

export function useProxyLatency(
  core: {
    daemon: string | undefined;
    pid: number | undefined;
    startedAt: number | null;
  },
  enabled: boolean
) {
  return useQuery({
    queryKey: [...PROXY_QUERY.latency(), core.daemon, core.pid, core.startedAt],
    queryFn: async (context) => decodeResponse(LatencyHistorySchema, await getProxyLatency(context), 'server latency'),
    enabled,
    select: toServerLatencies,
    placeholderData: (previous, previousQuery) => {
      const [, , daemon] = previousQuery?.queryKey ?? [];

      if (previous === undefined || daemon !== core.daemon) return undefined;

      return {
        ...previous,
        servers: previous.servers.map((server) => ({
          ...server,
          current: undefined,
          level: LATENCY_LEVEL.NoMeasurement,
        })),
      };
    },
    staleTime: CACHE_TIME.Minute,
    refetchInterval: CACHE_TIME.Minute,
  });
}

export function useProxyProviders() {
  return useQuery({ ...getProxyProvidersOptions(), select: toProxyProviders });
}
