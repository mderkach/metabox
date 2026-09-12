import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { CACHE_TIME } from '@shared/api';

import { toProxyProviders, toProxyRuntime, withSelectedNode } from '../model/Proxy.adapter';
import { getProxies, getProxyProviders, selectProxy, testProxyDelay } from './Proxy.api';
import type { ClashProxiesWire } from './Proxy.schema';

export const PROXY_QUERY = {
  all: ['proxy'] as const,
  list: () => [...PROXY_QUERY.all, 'list'] as const,
  providers: () => [...PROXY_QUERY.all, 'providers'] as const,
} as const;

export function getProxiesOptions() {
  return queryOptions({
    queryKey: PROXY_QUERY.list(),
    queryFn: async ({ signal }) => getProxies({ signal }),
    staleTime: CACHE_TIME.Second,
    gcTime: CACHE_TIME.Minute,
    meta: { showError: true, errorMessageKey: 'proxy.list.fetchFailed' },
  });
}

export function getProxyProvidersOptions() {
  return queryOptions({
    queryKey: PROXY_QUERY.providers(),
    queryFn: async ({ signal }) => getProxyProviders({ signal }),
    staleTime: CACHE_TIME.Minute,
    gcTime: CACHE_TIME.Hour,
    meta: { showError: true, errorMessageKey: 'proxy.providers.fetchFailed' },
  });
}

export function useProxies() {
  return useQuery({ ...getProxiesOptions(), select: toProxyRuntime });
}

export function useProxyProviders() {
  return useQuery({ ...getProxyProvidersOptions(), select: toProxyProviders });
}

interface SelectVariables {
  group: string;
  node: string;
}

/**
 * Переключение узла в группе. Обновление оптимистичное: ответ рантайма ничего
 * не добавляет к тому, что уже известно, а задержка ответа читалась бы как
 * зависший интерфейс. Цену Apply это не имеет — конфиг не пишется.
 */
export function useSelectProxy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ group, node }: SelectVariables) => selectProxy(group, node),
    meta: { showError: true, errorMessageKey: 'proxy.select.failed' },
    onMutate: async ({ group, node }: SelectVariables) => {
      await queryClient.cancelQueries({ queryKey: PROXY_QUERY.list() });

      const previous = queryClient.getQueryData<ClashProxiesWire>(PROXY_QUERY.list());

      if (previous !== undefined) {
        queryClient.setQueryData<ClashProxiesWire>(PROXY_QUERY.list(), withSelectedNode(previous, group, node));
      }

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(PROXY_QUERY.list(), context.previous);
      }
    },
    onSettled: async () => queryClient.invalidateQueries({ queryKey: PROXY_QUERY.list() }),
  });
}

export function useTestProxyDelay() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => testProxyDelay(name),
    meta: { showError: true, errorMessageKey: 'proxy.delay.failed' },
    onSettled: async () => queryClient.invalidateQueries({ queryKey: PROXY_QUERY.list() }),
  });
}
