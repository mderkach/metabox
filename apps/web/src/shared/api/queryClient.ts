import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { API_FAILURE, ApiError } from './ApiError';
import { showQueryError, showQuerySuccess } from './queryMeta';

const GET_RETRY_COUNT = 2;
const CLIENT_ERROR_MIN = 400;
const CLIENT_ERROR_MAX = 500;

/**
 * A 4xx response is the daemon's verdict, not a connection failure: a retry returns the same.
 * Retrying daemon unavailability is pointless too — the panel shows a banner and
 * waits for it to come up.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= GET_RETRY_COUNT) {
    return false;
  }

  if (!(error instanceof ApiError)) {
    return true;
  }

  if (error.kind === API_FAILURE.Unreachable) {
    return false;
  }

  // A retry returns the same unparseable response: the form does not change because
  // the request was sent a second time.
  if (error.kind === API_FAILURE.Schema) {
    return false;
  }

  const status = error.status ?? 0;

  return status < CLIENT_ERROR_MIN || status >= CLIENT_ERROR_MAX;
}

/**
 * One client per application. The cache is off by default: lifetime is set
 * where the request is declared, not inherited silently (Query.md).
 *
 * Mutations are not retried at all — a retry of Apply would start a second
 * write and restart cycle on the device.
 */
export const QueryClientInstance = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      gcTime: 0,
      refetchOnWindowFocus: false,
      refetchIntervalInBackground: false,
      retry: shouldRetry,
    },
    mutations: { retry: false },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      showQueryError(query.meta, error);
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      showQueryError(mutation.meta, error);
    },
    onSuccess: (_data, _vars, _ctx, mutation) => {
      showQuerySuccess(mutation.meta);
    },
  }),
});
