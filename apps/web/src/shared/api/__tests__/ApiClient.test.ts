import { AxiosError, type AxiosAdapter } from 'axios';
import { describe, expect, it } from 'vitest';

import { ApiClient } from '../ApiClient';
import { API_FAILURE, ApiError } from '../ApiError';

const OK = 200;
const NOT_FOUND = 404;
const UNPROCESSABLE = 422;
const BAD_GATEWAY = 502;

const SUCCESS_MIN = 200;
const SUCCESS_MAX = 300;

/**
 * Клиент поверх подставного транспорта. Адаптер — штатная точка подмены в
 * axios, поэтому интерцептор и разбор ответа в тесте настоящие.
 */
function clientAnswering(status: number, data: unknown, statusText = ''): ApiClient {
  // Контракт AxiosAdapter обязывает вернуть промис, но ждать здесь нечего.
  // oxlint-disable-next-line typescript/require-await -- см. выше
  const adapter: AxiosAdapter = async (config) => {
    const response = { data, status, statusText, headers: {}, config };

    // Отбраковку неуспешного статуса встроенные адаптеры делают сами, до
    // возврата в axios; кастомный обязан повторить это, иначе 404 доедет до
    // вызывающего как успешный ответ.
    if (status >= SUCCESS_MIN && status < SUCCESS_MAX) {
      return response;
    }

    throw new AxiosError(statusText, AxiosError.ERR_BAD_REQUEST, config, undefined, response);
  };

  return new ApiClient({ adapter });
}

function clientFailing(error: Error): ApiClient {
  // oxlint-disable-next-line typescript/require-await -- контракт AxiosAdapter
  const adapter: AxiosAdapter = async () => {
    throw error;
  };

  return new ApiClient({ adapter });
}

/** Сужает пойманное значение до отказа API, не прибегая к утверждению типа. */
function asApiError(error: unknown): ApiError {
  if (!(error instanceof ApiError)) {
    throw new TypeError('ожидался ApiError');
  }

  return error;
}

describe('ApiClient', () => {
  it('отдаёт тело ответа, а не конверт транспорта', async () => {
    const client = clientAnswering(OK, { version: '1.13.18' });

    await expect(client.get('/api/status')).resolves.toEqual({
      version: '1.13.18',
    });
  });

  it('отмечает недоступность демона отдельным видом отказа', async () => {
    const client = clientFailing(new AxiosError('Network Error', AxiosError.ERR_NETWORK));

    const error = await client.get('/api/status').catch((cause: unknown) => cause);

    expect(asApiError(error).kind).toBe(API_FAILURE.Unreachable);
  });

  it('считает истёкший таймаут недоступностью, а не ответом', async () => {
    const client = clientFailing(new AxiosError('timeout exceeded', AxiosError.ECONNABORTED));

    const error = await client.get('/api/status').catch((cause: unknown) => cause);

    expect(asApiError(error).kind).toBe(API_FAILURE.Unreachable);
  });

  it('разбирает отказ демона и сохраняет его код', async () => {
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

  it('сохраняет подробности отказа sing-box без разбора', async () => {
    const client = clientAnswering(UNPROCESSABLE, {
      code: 'check_failed',
      message: 'sing-box отверг конфиг',
      details: { stdout: '', stderr: 'FATAL', exit_code: 1 },
    });

    const error = asApiError(await client.post('/api/apply').catch((cause: unknown) => cause));

    expect(error.details).toEqual({ stdout: '', stderr: 'FATAL', exit_code: 1 });
  });

  it('считает шлюзовой статус недоступностью, а не ответом демона', async () => {
    const client = clientAnswering(BAD_GATEWAY, '<html>502</html>');

    const error = asApiError(await client.get('/api/status').catch((cause: unknown) => cause));

    expect(error.kind).toBe(API_FAILURE.Unreachable);
  });

  it('не падает на теле, которое не разбирается как отказ демона', async () => {
    const client = clientAnswering(NOT_FOUND, '<html>404</html>', 'Not Found');

    const error = asApiError(await client.get('/api/status').catch((cause: unknown) => cause));

    expect(error.kind).toBe(API_FAILURE.Response);
    expect(error.code).toBeNull();
    expect(error.message).toBe('Not Found');
  });

  it('пропускает отмену запроса, чтобы она не читалась как отказ демона', async () => {
    const controller = new AbortController();
    const client = clientFailing(new AxiosError('canceled', AxiosError.ERR_CANCELED));

    controller.abort();

    const error = await client.get('/api/status', { signal: controller.signal }).catch((cause: unknown) => cause);

    expect(error).not.toBeInstanceOf(ApiError);
  });
});
