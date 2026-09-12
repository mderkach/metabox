import type { AxiosRequestConfig } from 'axios';

import type { ApplyTransaction } from '@entities/Daemon/@x/config';
import { API_ENDPOINT, ApiClientInstance } from '@shared/api';

import type { ConfigVersionsDto } from './Config.dto';

/** Axios разобрал бы тело в объект, а нам нужны исходные байты файла. */
const KEEP_RAW = [(data: string) => data];

/** Ответ читается текстом: форматирование файла сохраняется (ADR-0004). */
const AS_TEXT: AxiosRequestConfig = { responseType: 'text', transformResponse: KEEP_RAW };

/**
 * Тело уходит строкой, и тип ставится руками: для строки axios заголовок сам
 * не выставляет, а демон принимает конфиг как JSON.
 */
const SEND_TEXT: AxiosRequestConfig = { headers: { 'Content-Type': 'application/json' } };

/**
 * Конфиг забирается текстом: правки применяются к исходным байтам, иначе
 * порядок ключей пользователя переписывается целиком (ADR-0004, AC-2).
 */
export async function getConfig(config?: AxiosRequestConfig): Promise<string> {
  return ApiClientInstance.get<string>(API_ENDPOINT.config(), { ...AS_TEXT, ...config });
}

/**
 * Запускает применение. Ответ приходит после `sing-box check`, но до конца
 * цикла: применение живёт дольше запроса (ADR-0002). Отказ проверки возвращает
 * 422 с выводом бинаря в `details` — его показывает вызывающий (AC-26).
 */
export async function applyConfig(text: string): Promise<ApplyTransaction> {
  return ApiClientInstance.post<ApplyTransaction, string>(API_ENDPOINT.apply(), text, SEND_TEXT);
}

export async function getApplyState(id: string, config?: AxiosRequestConfig): Promise<ApplyTransaction> {
  return ApiClientInstance.get<ApplyTransaction>(API_ENDPOINT.applyState(id), config);
}

/** Подтверждает, что связь жива: без этого демон вернёт предыдущий конфиг. */
export async function confirmApply(id: string): Promise<ApplyTransaction> {
  return ApiClientInstance.post<ApplyTransaction>(API_ENDPOINT.applyConfirm(id));
}

export async function getConfigVersions(config?: AxiosRequestConfig): Promise<ConfigVersionsDto> {
  return ApiClientInstance.get<ConfigVersionsDto>(API_ENDPOINT.configVersions(), config);
}

/** Версия отдаётся теми же байтами, какими была применена. */
export async function getConfigVersion(id: number, config?: AxiosRequestConfig): Promise<string> {
  return ApiClientInstance.get<string>(API_ENDPOINT.configVersion(id), { ...AS_TEXT, ...config });
}

/**
 * Откат на версию. Демон проводит её обычным протоколом Apply, поэтому ответ —
 * такая же транзакция с окном подтверждения (ADR-0008).
 */
export async function restoreConfigVersion(id: number): Promise<ApplyTransaction> {
  return ApiClientInstance.post<ApplyTransaction>(API_ENDPOINT.configVersionRestore(id));
}
