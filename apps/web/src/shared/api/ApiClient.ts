import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from "axios"

import { API_FAILURE, ApiError } from "./ApiError"

/**
 * Потолок ожидания ответа. У `fetch` таймаута нет вовсе, и зависший демон
 * держал бы запрос до закрытия вкладки; полный цикл Apply укладывается в 15
 * секунд (NFR-5), так что более долгий ответ — уже отказ.
 */
const REQUEST_TIMEOUT = 15_000

const BAD_GATEWAY = 502
const SERVICE_UNAVAILABLE = 503
const GATEWAY_TIMEOUT = 504

/**
 * Шлюзовые статусы выставляет не демон, а посредник между ним и браузером —
 * dev-прокси Vite, а на устройстве может и reverse proxy. Означают они то же,
 * что оборванный запрос: демон не ответил.
 */
const GATEWAY_STATUS = new Set([
  BAD_GATEWAY,
  SERVICE_UNAVAILABLE,
  GATEWAY_TIMEOUT,
])

/** Тело отказа демона — `httpapi.APIError`. */
interface ApiErrorBody {
  code: string
  message: string
  details?: unknown
}

function isApiErrorBody(body: unknown): body is ApiErrorBody {
  return (
    typeof body === "object" &&
    body !== null &&
    "code" in body &&
    typeof body.code === "string" &&
    "message" in body &&
    typeof body.message === "string"
  )
}

function fromResponse(response: AxiosResponse<unknown>): ApiError {
  if (GATEWAY_STATUS.has(response.status)) {
    return new ApiError(API_FAILURE.Unreachable, "демон не отвечает", {
      status: response.status,
    })
  }

  if (isApiErrorBody(response.data)) {
    return new ApiError(API_FAILURE.Response, response.data.message, {
      status: response.status,
      code: response.data.code,
      details: response.data.details,
    })
  }

  return new ApiError(API_FAILURE.Response, response.statusText, {
    status: response.status,
  })
}

/**
 * Приводит отказ транспорта к доменному. Отмену пропускает как есть: её
 * порождает сам Query при размонтировании, и показать её как «демон не
 * отвечает» значит мигать баннером на каждом переходе между экранами.
 */
function toApiError(error: unknown): unknown {
  if (axios.isCancel(error)) {
    return error
  }

  if (!axios.isAxiosError(error)) {
    return error
  }

  if (error.response === undefined) {
    return new ApiError(API_FAILURE.Unreachable, "демон не отвечает", {
      cause: error,
    })
  }

  return fromResponse(error.response)
}

/**
 * Клиент демона.
 *
 * Наружу отдаёт тело ответа, а не конверт транспорта: слой запросов не должен
 * протекать в fetch-функции сущностей. Ретраев здесь нет намеренно — ими
 * заведует Query, и второй слой повторов запустил бы на устройстве второй цикл
 * применения.
 */
export class ApiClient {
  private readonly http: AxiosInstance

  constructor(config?: AxiosRequestConfig) {
    this.http = axios.create({ timeout: REQUEST_TIMEOUT, ...config })

    this.http.interceptors.response.use(undefined, (error: unknown) => {
      throw toApiError(error)
    })
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.http.get<T>(url, config)

    return response.data
  }

  async post<T, P = unknown>(
    url: string,
    data?: P,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await this.http.post<T>(url, data, config)

    return response.data
  }
}

/** Экземпляр на приложение: демон один и живёт на том же origin. */
export const ApiClientInstance = new ApiClient()
