import { server } from '@test/server';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { API_FAILURE, ApiError, QueryClientInstance } from '@shared/api';

import { PROXY_ENDPOINT } from '../api/Proxy.endpoints';
import { getProxiesOptions } from '../api/Proxy.query';

vi.mock('sonner', () => ({
  toast: { error: vi.fn<(text: string) => void>(), success: vi.fn<(text: string) => void>() },
}));

const { toast } = await import('sonner');

/**
 * Ответ, который схема не примет: `proxies` обязан быть объектом.
 *
 * Разбор живёт в `queryFn`, а не в `select`: исключение из `select` query-core
 * держит у наблюдателя и в `QueryCache.onError` не проводит — тоста бы не было,
 * а отказ вида `Schema` не доходил бы и до правила повтора.
 */
const BROKEN = { proxies: 'всё сразу' };

describe('схемный отказ', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    QueryClientInstance.clear();
    server.use(http.get(PROXY_ENDPOINT.proxies(), () => HttpResponse.json(BROKEN)));
  });

  it('доходит до тоста, а не гаснет внутри запроса', async () => {
    await expect(QueryClientInstance.query(getProxiesOptions())).rejects.toThrow(ApiError);

    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it('не повторяется: второй запрос вернёт тот же неразобранный ответ', async () => {
    const attempts: string[] = [];

    server.use(
      http.get(PROXY_ENDPOINT.proxies(), () => {
        attempts.push('get');

        return HttpResponse.json(BROKEN);
      })
    );

    await expect(QueryClientInstance.query(getProxiesOptions())).rejects.toMatchObject({
      kind: API_FAILURE.Schema,
    });

    expect(attempts).toHaveLength(1);
  });
});
