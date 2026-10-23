import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import i18next from 'i18next';
import { z } from 'zod';

import { API_FAILURE, ApiError } from './ApiError';
import { TIMEOUT } from './cacheTime';
import { ErrorSchema } from './daemon.generated';

const BAD_GATEWAY = 502;
const SERVICE_UNAVAILABLE = 503;
const GATEWAY_TIMEOUT = 504;

/** Without a daemon body they mean the same as a broken request: an intermediary answered. */
const GATEWAY_STATUS = new Set([BAD_GATEWAY, SERVICE_UNAVAILABLE, GATEWAY_TIMEOUT]);

/** The daemon's refusal body comes from its contract. */
const ApiErrorBodySchema = ErrorSchema;

/**
 * A Clash API refusal that the daemon proxies verbatim: it has no code. The core
 * also returns 503 for it — a subscription did not update — and without parsing the body such a response
 * would read as the daemon being silent, and the toast about it would be suppressed.
 */
const ClashErrorBodySchema = z.object({ message: z.string() });

/**
 * The refusal body arrives as a string when the request asked for raw text: without parsing,
 * the daemon's code and message would be lost, and `config_missing` would become "Not Found".
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

/** The daemon sends `Retry-After` in whole seconds; the HTTP date form is not used by it. */
function readRetryAfter(response: AxiosResponse<unknown>): number | null {
  const value: unknown = response.headers['retry-after'];
  const seconds = typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;

  return Number.isInteger(seconds) && seconds >= 0 ? seconds : null;
}

function fromResponse(response: AxiosResponse<unknown>): ApiError {
  const body = ApiErrorBodySchema.safeParse(asErrorBody(response.data));

  // A body in the daemon format is parsed before the status: the daemon sets
  // the gateway code itself too — that is how it reports the sing-box runtime is unavailable, not itself.
  // Without this check a down sing-box would read as a silent daemon.
  if (body.success) {
    return new ApiError(API_FAILURE.Response, body.data.message, {
      status: response.status,
      code: body.data.code,
      details: body.data.details,
      retryAfter: readRetryAfter(response),
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

/** Cancellation passes through as is: Query produces it on unmount. */
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
  /** `ETag` as the server sent it, with quotes: it goes back into `If-Match` unparsed. */
  etag: string | null;
}

function readEtag(response: AxiosResponse<unknown>): string | null {
  const value: unknown = response.headers['etag'];

  return typeof value === 'string' ? value : null;
}

/**
 * Returns the response body, not the transport envelope. No retries: Query owns them,
 * and a second retry layer would start a second apply cycle on the device.
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

  /** The same `get`, but with the response `ETag`: needed by endpoints with optimistic locking. */
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
