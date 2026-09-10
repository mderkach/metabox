import { queryOptions, useQuery } from '@tanstack/react-query';

import { CACHE_TIME, POLL_INTERVAL } from '@shared/api';

import { getDaemonStatus } from './Daemon.api';

export const DAEMON_QUERY = {
  all: ['daemon'] as const,
  status: () => [...DAEMON_QUERY.all, 'status'] as const,
} as const;

export function getDaemonStatusOptions() {
  return queryOptions({
    queryKey: DAEMON_QUERY.status(),
    queryFn: async ({ signal }) => getDaemonStatus({ signal }),
    staleTime: CACHE_TIME.Second,
    gcTime: CACHE_TIME.Minute,
    refetchInterval: POLL_INTERVAL.Status,
    // Недоступность демона показывает баннер оболочки, а не тост на каждый
    // неудачный опрос: опрос идёт постоянно и завалил бы экран.
    meta: { showError: false },
  });
}

/**
 * Состояние демона. Отказ этого запроса — единственный признак, по которому
 * панель отличает «демон не поднят» от «сервис лежит»: второе демон сообщает
 * ответом, первое — молчанием (NFR-1).
 */
export function useDaemonStatus() {
  return useQuery(getDaemonStatusOptions());
}
