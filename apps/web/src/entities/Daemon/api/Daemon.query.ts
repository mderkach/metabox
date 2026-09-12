import { queryOptions, useQuery } from '@tanstack/react-query';

import { CACHE_TIME, POLL_INTERVAL } from '@shared/api';

import { toClashConfigs, toDaemonStatus, toServiceState } from '../model/Daemon.adapter';
import { getClashConfigs, getDaemonStatus, getServiceState } from './Daemon.api';

/** Значение флагов демона по умолчанию: то же, что в `main.go`. */
const DEFAULT_CONFIG_PATH = '/etc/sing-box/config.json';

export const DAEMON_QUERY = {
  all: ['daemon'] as const,
  status: () => [...DAEMON_QUERY.all, 'status'] as const,
  service: () => [...DAEMON_QUERY.all, 'service'] as const,
  clashConfigs: () => [...DAEMON_QUERY.all, 'clash-configs'] as const,
} as const;

export function getDaemonStatusOptions() {
  return queryOptions({
    queryKey: DAEMON_QUERY.status(),
    queryFn: getDaemonStatus,
    staleTime: CACHE_TIME.Second,
    gcTime: CACHE_TIME.Minute,
    refetchInterval: POLL_INTERVAL.Status,
    // Недоступность демона показывает баннер оболочки, а не тост на каждый
    // неудачный опрос: опрос идёт постоянно и завалил бы экран.
    meta: { showError: false },
  });
}

/**
 * Состояние демона. Отказ этого запроса — единственный признак, по которому
 * панель отличает «демон не поднят» от «сервис лежит»: второе демон сообщает
 * ответом, первое — молчанием (NFR-1).
 */
export function useDaemonStatus() {
  return useQuery({ ...getDaemonStatusOptions(), select: toDaemonStatus });
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
    queryFn: getServiceState,
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
 * в одном состоянии нельзя (NFR-1).
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
    queryFn: getClashConfigs,
    staleTime: CACHE_TIME.Minute,
    gcTime: CACHE_TIME.Hour,
    meta: { showError: false },
  });
}

/** Режим Clash API: правило `clash_mode` в конфиге сверяется именно с ним. */
export function useClashConfigs() {
  return useQuery({ ...getClashConfigsOptions(), select: toClashConfigs });
}
