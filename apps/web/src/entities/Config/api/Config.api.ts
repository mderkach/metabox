import type { AxiosRequestConfig } from 'axios';

import { DAEMON_ENDPOINT, type ApplyTransactionWire } from '@entities/Daemon/@x/config';
import { ApiClientInstance } from '@shared/api';

import { CONFIG_ENDPOINT } from './Config.endpoints';
import type { ConfigVersionsWire } from './Config.schema';

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
 * порядок ключей пользователя переписывается целиком (ADR-0004).
 */
export async function getConfig(config?: AxiosRequestConfig): Promise<string> {
  return ApiClientInstance.get<string>(CONFIG_ENDPOINT.config(), { ...AS_TEXT, ...config });
}

export async function getApplyState(id: string, config?: AxiosRequestConfig): Promise<ApplyTransactionWire> {
  return ApiClientInstance.get<ApplyTransactionWire>(DAEMON_ENDPOINT.applyState(id), config);
}

export async function getConfigVersions(config?: AxiosRequestConfig): Promise<ConfigVersionsWire> {
  return ApiClientInstance.get<ConfigVersionsWire>(CONFIG_ENDPOINT.versions(), config);
}

/** Версия отдаётся теми же байтами, какими была применена. */
export async function getConfigVersion(id: number, config?: AxiosRequestConfig): Promise<string> {
  return ApiClientInstance.get<string>(CONFIG_ENDPOINT.version(id), { ...AS_TEXT, ...config });
}

/**
 * Запускает применение. Ответ приходит после `sing-box check`, но до конца
 * цикла: применение живёт дольше запроса (ADR-0002). Отказ проверки возвращает
 * 422 с выводом бинаря в `details` — его показывает вызывающий.
 */
export async function applyConfig(text: string): Promise<ApplyTransactionWire> {
  return ApiClientInstance.post<ApplyTransactionWire, string>(DAEMON_ENDPOINT.apply(), text, SEND_TEXT);
}

/** Подтверждает, что связь жива: без этого демон вернёт предыдущий конфиг. */
export async function confirmApply(id: string): Promise<ApplyTransactionWire> {
  return ApiClientInstance.post<ApplyTransactionWire>(DAEMON_ENDPOINT.applyConfirm(id));
}

/**
 * Откат на версию. Демон проводит её обычным протоколом Apply, поэтому ответ —
 * такая же транзакция с окном подтверждения (ADR-0008).
 */
export async function restoreConfigVersion(id: number): Promise<ApplyTransactionWire> {
  return ApiClientInstance.post<ApplyTransactionWire>(CONFIG_ENDPOINT.versionRestore(id));
}
