import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios';

import { API_FAILURE, ApiError } from './ApiError';

/** Полный цикл Apply укладывается в 15 секунд (NFR-5) — дольше уже отказ. */
const REQUEST_TIMEOUT = 15_000;

const BAD_GATEWAY = 502;
const SERVICE_UNAVAILABLE = 503;
const GATEWAY_TIMEOUT = 504;

/** Их выставляет посредник, а не демон: значат то же, что оборванный запрос. */
const GATEWAY_STATUS = new Set([BAD_GATEWAY, SERVICE_UNAVAILABLE, GATEWAY_TIMEOUT]);

/** Тело отказа демона — `httpapi.APIError`. */
interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

function isApiErrorBody(body: unknown): body is ApiErrorBody {
  return (
    typeof body === 'object' &&
    body !== null &&
    'code' in body &&
    typeof body.code === 'string' &&
    'message' in body &&
    typeof body.message === 'string'
  );
}

function fromResponse(response: AxiosResponse<unknown>): ApiError {
  if (GATEWAY_STATUS.has(response.status)) {
    return new ApiError(API_FAILURE.Unreachable, 'демон не отвечает', {
      status: response.status,
    });
  }

  if (isApiErrorBody(response.data)) {
    return new ApiError(API_FAILURE.Response, response.data.message, {
      status: response.status,
      code: response.data.code,
      details: response.data.details,
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
    return new ApiError(API_FAILURE.Unreachable, 'демон не отвечает', {
      cause: error,
    });
  }

  return fromResponse(error.response);
}

/**
 * Отдаёт тело ответа, а не конверт транспорта. Ретраев нет: ими заведует Query,
 * а второй слой повторов запустил бы на устройстве второй цикл применения.
 */
export class ApiClient {
  private readonly http: AxiosInstance;

  constructor(config?: AxiosRequestConfig) {
    this.http = axios.create({ timeout: REQUEST_TIMEOUT, ...config });

    this.http.interceptors.response.use(undefined, (error: unknown) => {
      throw toApiError(error);
    });
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.http.get<T>(url, config);

    return response.data;
  }

  async post<T, P = unknown>(url: string, data?: P, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.http.post<T>(url, data, config);

    return response.data;
  }
}

export const ApiClientInstance = new ApiClient();
