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
 * A response the schema will not accept: `proxies` must be an object.
 *
 * Parsing lives in `queryFn`, not in `select`: an exception from `select` query-core
 * keeps on the observer and does not pass to `QueryCache.onError`: there would be no toast,
 * and a `Schema` failure would not reach the retry rule either.
 */
const BROKEN = { proxies: 'всё сразу' };

describe('schema failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    QueryClientInstance.clear();
    server.use(http.get(PROXY_ENDPOINT.proxies(), () => HttpResponse.json(BROKEN)));
  });

  it('reaches the toast instead of fading inside the query', async () => {
    await expect(QueryClientInstance.query(getProxiesOptions())).rejects.toThrow(ApiError);

    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it('is not retried: the second request returns the same unparsed response', async () => {
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
