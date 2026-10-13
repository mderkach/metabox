import { AxiosError, type AxiosAdapter } from 'axios';
import { describe, expect, it } from 'vitest';

import { ApiClient } from '../ApiClient';
import { API_FAILURE, ApiError } from '../ApiError';

const OK = 200;
const NOT_FOUND = 404;
const UNPROCESSABLE = 422;
const BAD_GATEWAY = 502;
const SERVICE_UNAVAILABLE = 503;

const SUCCESS_MIN = 200;
const SUCCESS_MAX = 300;

/**
 * A client over a substitute transport. The adapter is the regular replacement point in
 * axios, so the interceptor and response parsing in the test are real.
 */
function clientAnswering(status: number, data: unknown, statusText = ''): ApiClient {
  // The AxiosAdapter contract requires returning a promise, but there is nothing to wait for here.
  // oxlint-disable-next-line typescript/require-await -- see above
  const adapter: AxiosAdapter = async (config) => {
    const response = { data, status, statusText, headers: {}, config };

    // Built-in adapters reject an unsuccessful status themselves, before
    // returning to axios; a custom one must repeat this, otherwise a 404 reaches
    // the caller as a successful response.
    if (status >= SUCCESS_MIN && status < SUCCESS_MAX) {
      return response;
    }

    throw new AxiosError(statusText, AxiosError.ERR_BAD_REQUEST, config, undefined, response);
  };

  return new ApiClient({ adapter });
}

function clientFailing(error: Error): ApiClient {
  // oxlint-disable-next-line typescript/require-await -- AxiosAdapter contract
  const adapter: AxiosAdapter = async () => {
    throw error;
  };

  return new ApiClient({ adapter });
}

/** Narrows a caught value to an API failure without resorting to a type assertion. */
function asApiError(error: unknown): ApiError {
  if (!(error instanceof ApiError)) {
    throw new TypeError('ожидался ApiError');
  }

  return error;
}

describe('ApiClient', () => {
  it('returns the response body, not the transport envelope', async () => {
    const client = clientAnswering(OK, { version: '1.13.18' });

    await expect(client.get('/api/status')).resolves.toEqual({
      version: '1.13.18',
    });
  });

  it('marks daemon unavailability with a separate failure kind', async () => {
    const client = clientFailing(new AxiosError('Network Error', AxiosError.ERR_NETWORK));

    const error = await client.get('/api/status').catch((cause: unknown) => cause);

    expect(asApiError(error).kind).toBe(API_FAILURE.Unreachable);
  });

  it('treats an expired timeout as unavailability, not as a response', async () => {
    const client = clientFailing(new AxiosError('timeout exceeded', AxiosError.ECONNABORTED));

    const error = await client.get('/api/status').catch((cause: unknown) => cause);

    expect(asApiError(error).kind).toBe(API_FAILURE.Unreachable);
  });

  it('parses a daemon failure and keeps its code', async () => {
    const client = clientAnswering(NOT_FOUND, {
      code: 'unknown_transaction',
      message: 'транзакции с таким идентификатором нет',
    });

    const error = asApiError(await client.get('/api/apply/42').catch((cause: unknown) => cause));

    expect(error.kind).toBe(API_FAILURE.Response);
    expect(error.code).toBe('unknown_transaction');
    expect(error.status).toBe(NOT_FOUND);
    expect(error.message).toBe('транзакции с таким идентификатором нет');
  });

  it('keeps sing-box failure details without parsing', async () => {
    const client = clientAnswering(UNPROCESSABLE, {
      code: 'check_failed',
      message: 'sing-box отверг конфиг',
      details: { stdout: '', stderr: 'FATAL', exit_code: 1 },
    });

    const error = asApiError(await client.post('/api/apply').catch((cause: unknown) => cause));

    expect(error.details).toEqual({ stdout: '', stderr: 'FATAL', exit_code: 1 });
  });

  it('treats a gateway status as unavailability, not as a daemon response', async () => {
    const client = clientAnswering(BAD_GATEWAY, '<html>502</html>');

    const error = asApiError(await client.get('/api/status').catch((cause: unknown) => cause));

    expect(error.kind).toBe(API_FAILURE.Unreachable);
  });

  // The daemon sets the same status itself when the sing-box runtime is unavailable: this is a
  // daemon response, and it must not be confused with panel silence.
  it('a gateway status with a daemon body counts as a response', async () => {
    const client = clientAnswering(BAD_GATEWAY, {
      code: 'runtime_unavailable',
      message: 'рантайм sing-box недоступен',
    });

    const error = asApiError(await client.get('/api/clash/rules').catch((cause: unknown) => cause));

    expect(error.kind).toBe(API_FAILURE.Response);
    expect(error.code).toBe('runtime_unavailable');
  });

  it('a core failure without a code counts as a response and keeps its message', async () => {
    const client = clientAnswering(SERVICE_UNAVAILABLE, { message: 'fetch subscription: 403' });

    const error = asApiError(await client.put('/api/clash/providers/proxies/sub').catch((cause: unknown) => cause));

    expect(error.kind).toBe(API_FAILURE.Response);
    expect(error.code).toBeNull();
    expect(error.message).toBe('fetch subscription: 403');
  });

  it('does not crash on a body that does not parse as a daemon failure', async () => {
    const client = clientAnswering(NOT_FOUND, '<html>404</html>', 'Not Found');

    const error = asApiError(await client.get('/api/status').catch((cause: unknown) => cause));

    expect(error.kind).toBe(API_FAILURE.Response);
    expect(error.code).toBeNull();
    expect(error.message).toBe('Not Found');
  });

  it('passes a request cancellation through so it is not read as a daemon failure', async () => {
    const controller = new AbortController();
    const client = clientFailing(new AxiosError('canceled', AxiosError.ERR_CANCELED));

    controller.abort();

    const error = await client.get('/api/status', { signal: controller.signal }).catch((cause: unknown) => cause);

    expect(error).not.toBeInstanceOf(ApiError);
  });
});
