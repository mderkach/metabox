import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import i18next from 'i18next';
import { z } from 'zod';

import { API_FAILURE, ApiError } from './ApiError';
import { TIMEOUT } from './cacheTime';
import { ErrorSchema } from './daemon.generated';

const BAD_GATEWAY = 502;
const SERVICE_UNAVAILABLE = 503;
const GATEWAY_TIMEOUT = 504;

/** Без тела демона они значат то же, что оборванный запрос: ответил посредник. */
const GATEWAY_STATUS = new Set([BAD_GATEWAY, SERVICE_UNAVAILABLE, GATEWAY_TIMEOUT]);

/** Тело отказа демона приходит из его контракта. */
const ApiErrorBodySchema = ErrorSchema;

/**
 * Отказ Clash API, который демон проксирует дословно: кода у него нет. Ядро
 * ставит ему и 503 — подписка не обновилась, — и без разбора тела такой ответ
 * читался бы молчанием демона, а тост о нём гасился бы.
 */
const ClashErrorBodySchema = z.object({ message: z.string() });

/**
 * Тело отказа приходит строкой, когда запрос просил сырой текст: без разбора
 * код и сообщение демона потерялись бы, и `config_missing` стал бы «Not Found».
 */
function asErrorBody(data: unknown): unknown {
  if (typeof data !== 'string') {
    return data;
  }

  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

function fromResponse(response: AxiosResponse<unknown>): ApiError {
  const body = ApiErrorBodySchema.safeParse(asErrorBody(response.data));

  // Тело в формате демона разбирается раньше статуса: шлюзовой код демон
  // ставит и сам — так он сообщает, что недоступен рантайм sing-box, а не он.
  // Без этой проверки лежащий sing-box читался бы как молчащий демон.
  if (body.success) {
    return new ApiError(API_FAILURE.Response, body.data.message, {
      status: response.status,
      code: body.data.code,
      details: body.data.details,
    });
  }

  const clashBody = ClashErrorBodySchema.safeParse(asErrorBody(response.data));

  if (clashBody.success) {
    return new ApiError(API_FAILURE.Response, clashBody.data.message, { status: response.status });
  }

  if (GATEWAY_STATUS.has(response.status)) {
    return new ApiError(API_FAILURE.Unreachable, i18next.t('daemon.silent', { ns: 'shared' }), {
      status: response.status,
    });
  }

  return new ApiError(API_FAILURE.Response, response.statusText, {
    status: response.status,
  });
}

/** Отмену пропускает как есть: её порождает Query при размонтировании. */
function toApiError(error: unknown): unknown {
  if (axios.isCancel(error)) {
    return error;
  }

  if (!axios.isAxiosError(error)) {
    return error;
  }

  if (error.response === undefined) {
    return new ApiError(API_FAILURE.Unreachable, i18next.t('daemon.silent', { ns: 'shared' }), {
      cause: error,
    });
  }

  return fromResponse(error.response);
}

export interface TaggedResponse<T> {
  body: T;
  /** `ETag` как прислал сервер, с кавычками: он возвращается в `If-Match` без разбора. */
  etag: string | null;
}

function readEtag(response: AxiosResponse<unknown>): string | null {
  const value: unknown = response.headers['etag'];

  return typeof value === 'string' ? value : null;
}

/**
 * Отдаёт тело ответа, а не конверт транспорта. Ретраев нет: ими заведует Query,
 * а второй слой повторов запустил бы на устройстве второй цикл применения.
 */
export class ApiClient {
  private readonly http: AxiosInstance;

  constructor(config?: AxiosRequestConfig) {
    this.http = axios.create({ timeout: TIMEOUT.Request, ...config });

    this.http.interceptors.response.use(undefined, (error: unknown) => {
      throw toApiError(error);
    });
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.http.get<T>(url, config);

    return response.data;
  }

  /** Тот же `get`, но с `ETag` ответа: он нужен ручкам с оптимистичной блокировкой. */
  async getTagged<T>(url: string, config?: AxiosRequestConfig): Promise<TaggedResponse<T>> {
    const response = await this.http.get<T>(url, config);

    return { body: response.data, etag: readEtag(response) };
  }

  async post<T, P = unknown>(url: string, data?: P, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.http.post<T>(url, data, config);

    return response.data;
  }

  async put<T, P = unknown>(url: string, data?: P, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.http.put<T>(url, data, config);

    return response.data;
  }

  async patch<T, P = unknown>(url: string, data?: P, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.http.patch<T>(url, data, config);

    return response.data;
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.http.delete<T>(url, config);

    return response.data;
  }
}

export const ApiClientInstance = new ApiClient();
