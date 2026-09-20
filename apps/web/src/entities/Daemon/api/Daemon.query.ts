import { queryOptions, useQuery } from '@tanstack/react-query';

import { API_FAILURE, ApiError, CACHE_TIME, POLL_INTERVAL, decodeResponse } from '@shared/api';

import { toClashConfigs, toDaemonStatus, toServiceState, toTrafficHistory } from '../model/Daemon.adapter';
import { getClashConfigs, getDaemonStatus, getServiceState, getTrafficHistory } from './Daemon.api';
import { ClashConfigsSchema, DaemonStatusSchema, ServiceStateSchema, TrafficHistorySchema } from './Daemon.schema';

/** Значение флагов демона по умолчанию: то же, что в `main.go`. */
const DEFAULT_CONFIG_PATH = '/etc/sing-box/config.json';

export const DAEMON_QUERY = {
  all: ['daemon'] as const,
  status: () => [...DAEMON_QUERY.all, 'status'] as const,
  history: () => [...DAEMON_QUERY.all, 'history'] as const,
  service: () => [...DAEMON_QUERY.all, 'service'] as const,
  clashConfigs: () => [...DAEMON_QUERY.all, 'clash-configs'] as const,
} as const;

export function getDaemonStatusOptions() {
  return queryOptions({
    queryKey: DAEMON_QUERY.status(),
    queryFn: async (context) => decodeResponse(DaemonStatusSchema, await getDaemonStatus(context), 'status'),
    staleTime: CACHE_TIME.Second,
    gcTime: CACHE_TIME.Minute,
    refetchInterval: POLL_INTERVAL.Status,
    // Недоступность демона показывает баннер оболочки, а не тост на каждый
    // неудачный опрос: опрос идёт постоянно и завалил бы экран.
    meta: { showError: false },
  });
}

export function getTrafficHistoryOptions() {
  return queryOptions({
    queryKey: DAEMON_QUERY.history(),
    queryFn: async (context) => decodeResponse(TrafficHistorySchema, await getTrafficHistory(context), 'history'),
    staleTime: POLL_INTERVAL.History,
    gcTime: CACHE_TIME.Minute,
    refetchInterval: POLL_INTERVAL.History,
    meta: { showError: false },
  });
}

/** История трафика с демона: панель держит в памяти только последнюю минуту. */
export function useTrafficHistory() {
  return useQuery({ ...getTrafficHistoryOptions(), select: toTrafficHistory });
}

/**
 * Состояние демона. Отказ этого запроса — единственный признак, по которому
 * панель отличает «демон не поднят» от «сервис лежит»: второе демон сообщает
 * ответом, первое — молчанием.
 */
export function useDaemonStatus() {
  return useQuery({ ...getDaemonStatusOptions(), select: toDaemonStatus });
}

/**
 * Демон отвечает или молчит. Молчанием считаются те же исходы, что красят
 * баннер недоступности: обрыв запроса и непонятая схема ответа. Ответ с кодом
 * ошибки демона молчанием не считается — это отказ конкретной ручки, а не
 * панели целиком.
 */
export function useDaemonReachable(): boolean {
  const status = useDaemonStatus();
  const kind = status.error instanceof ApiError ? status.error.kind : null;

  return kind !== API_FAILURE.Unreachable && kind !== API_FAILURE.Schema;
}

/**
 * Путь конфига на устройстве. Демон, запущенный с другими `-config-dir` и
 * `-config-name`, сообщает свой; значение по умолчанию остаётся на случай
 * сборки демона, которая поля ещё не отдаёт.
 */
export function useConfigPath(): string {
  const status = useDaemonStatus();

  return status.data?.configPath ?? DEFAULT_CONFIG_PATH;
}

export function getServiceStateOptions() {
  return queryOptions({
    queryKey: DAEMON_QUERY.service(),
    queryFn: async (context) => decodeResponse(ServiceStateSchema, await getServiceState(context), 'service'),
    staleTime: CACHE_TIME.Second,
    gcTime: CACHE_TIME.Minute,
    // Опроса нет: состояние обновляет топик `service` единого потока, а тело
    // у потока и у ручки одно (ADR-0010). Запрос остаётся первым значением —
    // до первого события экрану надо что-то показать.
    meta: { showError: false },
  });
}

/**
 * Состояние сервиса. Отдельный запрос от `GET /api/status`: остановленный
 * sing-box — данные экрана, а молчание демона — отказ панели, и смешивать их
 * в одном состоянии нельзя.
 *
 * Живым состояние держит топик `service` единого потока, а поток открыт, пока
 * экран объявил себя читателем рантайма (`useRuntimeStream`). Экран, который
 * покажет состояние сервиса без этого объявления, получит его один раз и
 * дальше будет показывать устаревшее.
 */
export function useServiceState() {
  return useQuery({ ...getServiceStateOptions(), select: toServiceState });
}

export function getClashConfigsOptions() {
  return queryOptions({
    queryKey: DAEMON_QUERY.clashConfigs(),
    queryFn: async (context) => decodeResponse(ClashConfigsSchema, await getClashConfigs(context), 'clash configs'),
    staleTime: CACHE_TIME.Minute,
    gcTime: CACHE_TIME.Hour,
    meta: { showError: false },
  });
}

/** Режим Clash API: правило `clash_mode` в конфиге сверяется именно с ним. */
export function useClashConfigs() {
  return useQuery({ ...getClashConfigsOptions(), select: toClashConfigs });
}
