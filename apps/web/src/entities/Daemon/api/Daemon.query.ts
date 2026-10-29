import { queryOptions, useQuery } from '@tanstack/react-query';

import { API_FAILURE, ApiError, CACHE_TIME, POLL_INTERVAL, decodeResponse } from '@shared/api';

import { toClashConfigs, toDaemonStatus, toServiceState, toTrafficHistory } from '../model/Daemon.adapter';
import { getClashConfigs, getDaemonStatus, getServiceState, getTrafficHistory } from './Daemon.api';
import { ClashConfigsSchema, DaemonStatusSchema, ServiceStateSchema, TrafficHistorySchema } from './Daemon.schema';

/** Default daemon flag values: the same as in `main.go`. */
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
    // Daemon unavailability is shown by the shell banner, not by a toast on
    // every failed poll: polling runs constantly and would flood the screen.
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

/** Traffic history from the daemon: the panel keeps only the last minute in memory. */
export function useTrafficHistory() {
  return useQuery({ ...getTrafficHistoryOptions(), select: toTrafficHistory });
}

/**
 * Daemon state. A failure of this query is the only sign by which the panel
 * tells "the daemon is not up" from "the service is down": the daemon reports
 * the second with a response, the first with silence.
 */
export function useDaemonStatus() {
  return useQuery({ ...getDaemonStatusOptions(), select: toDaemonStatus });
}

/**
 * The daemon process that answers the status: a new value means the daemon was
 * restarted. Only the value is selected, so a status poll with the same process
 * does not rerender the reader.
 */
export function useDaemonInstance(): string | undefined {
  return useQuery({ ...getDaemonStatusOptions(), select: selectInstance }).data;
}

function selectInstance(wire: { instance: string }): string {
  return wire.instance;
}

/**
 * Whether the daemon answers or is silent. Silence covers the same cases that
 * paint the unavailability banner: a broken request and a response schema that
 * is not understood. A response with a daemon error code is not silence: it is
 * a failure of a specific endpoint, not of the whole panel.
 */
export function useDaemonReachable(): boolean {
  const status = useDaemonStatus();
  const kind = status.error instanceof ApiError ? status.error.kind : null;

  return kind !== API_FAILURE.Unreachable && kind !== API_FAILURE.Schema;
}

/**
 * Config path on the device. A daemon started with other `-config-dir` and
 * `-config-name` reports its own; the default stays for a daemon build that
 * does not serve the field yet.
 */
export function useConfigPath(): string {
  const status = useDaemonStatus();

  return status.data?.configPath ?? DEFAULT_CONFIG_PATH;
}

/** How long an apply waits for confirmation; `null` until the daemon status arrives. */
export function useConfirmWindow(): number | null {
  const status = useDaemonStatus();

  return status.data?.confirmWindowSeconds ?? null;
}

export function getServiceStateOptions() {
  return queryOptions({
    queryKey: DAEMON_QUERY.service(),
    queryFn: async (context) => decodeResponse(ServiceStateSchema, await getServiceState(context), 'service'),
    staleTime: CACHE_TIME.Second,
    gcTime: CACHE_TIME.Minute,
    // There is no polling: the state is updated by the `service` topic of the
    // single stream, and the body is the same for the stream and the endpoint.
    // The query stays the first value, since the screen needs something to show
    // before the first event.
    meta: { showError: false },
  });
}

/**
 * Service state. A separate query from `GET /api/status`: a stopped sing-box is
 * screen data, while daemon silence is a panel failure, and they must not be
 * mixed in one state.
 *
 * The `service` topic of the single stream keeps the state live, and the stream
 * is open while a screen has declared itself a runtime reader
 * (`useRuntimeStream`). A screen that shows the service state without that
 * declaration gets it once and then shows stale data.
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

/** Clash API mode: the `clash_mode` rule in the config is matched against exactly it. */
export function useClashConfigs() {
  return useQuery({ ...getClashConfigsOptions(), select: toClashConfigs });
}
