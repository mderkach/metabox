import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { API_FAILURE, ApiError } from './ApiError';
import { showQueryError, showQuerySuccess } from './queryMeta';

const GET_RETRY_COUNT = 2;
const CLIENT_ERROR_MIN = 400;
const CLIENT_ERROR_MAX = 500;

/**
 * Ответ 4xx — вердикт демона, а не сбой связи: повтор вернёт то же самое.
 * Недоступность демона повторять тоже незачем — панель показывает баннер и
 * ждёт, пока он поднимется.
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

  // Повтор вернёт тот же непонятый ответ: форма не меняется от того, что
  // запрос отправлен второй раз.
  if (error.kind === API_FAILURE.Schema) {
    return false;
  }

  const status = error.status ?? 0;

  return status < CLIENT_ERROR_MIN || status >= CLIENT_ERROR_MAX;
}

/**
 * Клиент один на приложение. Кэш выключен по умолчанию: время жизни задаётся
 * там, где запрос объявлен, а не наследуется молча (Query.md).
 *
 * Мутации не повторяются вовсе — повтор Apply запустил бы на устройстве второй
 * цикл записи и рестарта.
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
