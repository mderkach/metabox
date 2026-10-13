import type { LinkProps } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  ConnectionState,
  ConnectionStore,
  HISTORY_WINDOW_POINTS,
  useConnectionCounts,
  type ConnectionSummary,
  type ConnectionTotals,
} from '@entities/Connection';
import {
  RuntimeState,
  TRAFFIC_WINDOW_POINTS,
  RuntimeStore,
  SERVICE_STATUS,
  toConfirmedStatus,
  useDaemonReachable,
  useServiceState,
  useTrafficHistory,
  useTrafficNow,
  type SystemStat,
  type TrafficSample,
  type TrafficShare,
  type UplinkRate,
} from '@entities/Daemon';
import { DELAY_STATE, useProxies } from '@entities/Proxy';
import { MS_IN_SECOND } from '@shared/lib/time';

/**
 * How many seconds without a frame count as a drop. The stream runs once a second, but
 * a collapsed tab delivers frames in bursts — the threshold has a margin.
 */
const STALE_SECONDS = 8;
const STALE_AFTER = STALE_SECONDS * MS_IN_SECOND;

/** How often freshness is rechecked: without a tick nobody would notice a frozen stream. */
const TICK_SECONDS = 3;
const FRESHNESS_TICK = TICK_SECONDS * MS_IN_SECOND;

const NO_SHARE: TrafficShare = { link: 0, proxy: 0, seconds: 0 };

export interface OverviewRuntime {
  traffic: TrafficSample[];
  now: TrafficSample;
  peakDown: number;
  peakUp: number;
  memory: number;
  totals: ConnectionTotals;
  /** Device readings; `null` means no snapshot has arrived yet. */
  system: SystemStat | null;
  /** Uplink interface speed right now. */
  uplink: UplinkRate;
  /** Channel and sing-box volumes over the daemon's observation window. */
  share: TrafficShare;
  summary: ConnectionSummary;
  /** Number of open connections over a minute. */
  history: number[];
  /** When the last `history` point was received: the chart time is counted from it. */
  historyAt: number | null;
  /** Peak of open connections over the visible minute. */
  historyPeak: number;
  counts: { active: number; closed: number };
  /** Runtime frames are arriving right now. */
  live: boolean;
  /** No frame has arrived yet: the screen shows waiting, not zeros. */
  awaiting: boolean;
  /** Device snapshots are arriving right now: the daemon sends them even without sing-box. */
  daemonLive: boolean;
  /** The screen has been open longer than the drop threshold and there is still no first traffic frame. */
  overdue: boolean;
  /** When the last traffic frame arrived, epoch milliseconds. */
  sampledAt: number | null;
  /** When the last traffic point was received: the chart time is counted from it. */
  trafficAt: number | null;
  /** No connection snapshot yet: counters show loading, not zero. */
  connectionsAwaiting: boolean;
}

function isFresh(at: number | null, checkedAt: number): boolean {
  return at !== null && Math.max(checkedAt, at) - at < STALE_AFTER;
}

/**
 * Overview screen data from two runtime streams. Built by a hook rather than
 * per-site selectors: there are about ten panels on the screen, and each one's own subscription
 * would spread their renders across different frames of the same snapshot.
 */
export function useOverviewRuntime(): OverviewRuntime {
  const traffic = RuntimeState.use.traffic();
  const now = useTrafficNow();
  const memory = RuntimeState.use.memoryNow();
  const sampledAt = RuntimeState.use.sampledAt();
  const trafficAt = RuntimeState.use.trafficAt();
  const system = RuntimeState.use.system();
  const systemAt = RuntimeState.use.systemAt();
  const uplink = RuntimeState.use.uplink();
  const totals = ConnectionState.use.totals();
  const summary = ConnectionState.use.summary();
  const history = ConnectionState.use.history();
  const historyAt = ConnectionState.use.historyAt();
  const counts = useConnectionCounts();
  const connectionsAt = ConnectionState.use.sampledAt();
  const trafficHistory = useTrafficHistory();
  const recent = trafficHistory.data?.recent;
  const connectionCounts = trafficHistory.data?.connections;

  // The minute charts open with what the daemon accumulated, not empty: the panel
  // is not always open, and the stream knows only what happened while the tab was open.
  useEffect(
    function seedMinuteCharts() {
      if (recent !== undefined) {
        RuntimeStore.getState().seedTraffic(recent);
      }

      if (connectionCounts !== undefined) {
        ConnectionStore.getState().seedHistory(connectionCounts);
      }
    },
    [recent, connectionCounts]
  );

  // A stream drop does not report itself: frames just stop arriving, and
  // without its own tick the screen would stay forever in the last "live" state.
  const [checkedAt, setCheckedAt] = useState(() => Date.now());
  const [openedAt] = useState(() => Date.now());

  useEffect(function watchFreshness() {
    const timer = setInterval(function checkFreshness() {
      setCheckedAt(Date.now());
    }, FRESHNESS_TICK);

    return function stopFreshness() {
      clearInterval(timer);
    };
  }, []);

  // The buffer is longer than the window by the points past the left edge: the minute peak counts only the visible ones.
  const peaks = useMemo(() => {
    const visible = traffic.slice(-TRAFFIC_WINDOW_POINTS);

    return {
      down: visible.reduce((max, sample) => Math.max(max, sample.down), 0),
      up: visible.reduce((max, sample) => Math.max(max, sample.up), 0),
    };
  }, [traffic]);
  const historyPeak = useMemo(() => Math.max(0, ...history.slice(-HISTORY_WINDOW_POINTS)), [history]);

  return {
    traffic,
    now,
    peakDown: peaks.down,
    peakUp: peaks.up,
    memory,
    totals,
    system,
    uplink,
    share: system?.share ?? NO_SHARE,
    summary,
    history,
    historyAt,
    historyPeak,
    counts,
    live: isFresh(sampledAt, checkedAt),
    awaiting: sampledAt === null,
    daemonLive: isFresh(systemAt, checkedAt),
    overdue: sampledAt === null && checkedAt - openedAt >= STALE_AFTER,
    sampledAt,
    trafficAt,
    connectionsAwaiting: connectionsAt === null,
  };
}

/** Above this the board already throttles. */
export const HOT_CELSIUS = 85;
const WARM_CELSIUS = 70;

export const VERDICT_TONE = {
  Ok: 'ok',
  /** The panel is waiting for data or reconnecting: this says nothing about the router itself. */
  Idle: 'idle',
  Warn: 'warn',
  Bad: 'bad',
} as const;

export type VerdictTone = (typeof VERDICT_TONE)[keyof typeof VERDICT_TONE];

export interface Verdict {
  tone: VerdictTone;
  title: string;
  /** What it means and what to do. */
  hint: string;
  /** Where to go to investigate; `null` means nowhere to investigate or no need to. */
  action: { to: LinkProps['to']; label: string } | null;
}

/**
 * The answer to the question the screen is opened for: is everything fine. Assembled
 * from signals the screen already shows — it has no source of its own.
 *
 * Order matters: first what makes the other numbers unreliable. A lost
 * panel-to-daemon link gets a neutral tone: the router may be working
 * fine meanwhile. Alarm only for what the daemon confirmed: the service is stopped or
 * the daemon sends device snapshots but there is no traffic from sing-box.
 */
export function useOverviewVerdict(
  runtime: Pick<OverviewRuntime, 'system' | 'live' | 'awaiting' | 'daemonLive' | 'overdue'>
): Verdict {
  const { t } = useTranslation('pages/Overview');
  const reachable = useDaemonReachable();
  const service = useServiceState();
  const proxies = useProxies();
  const logs = { to: '/logs', label: t('verdict.action.logs') } as const;

  if (!reachable) {
    return { tone: VERDICT_TONE.Idle, title: t('verdict.offline'), hint: t('verdict.offlineHint'), action: null };
  }

  const status = service.data === undefined ? null : toConfirmedStatus(service.data);

  if (status !== null && status !== SERVICE_STATUS.Running) {
    return { tone: VERDICT_TONE.Bad, title: t('verdict.stopped'), hint: t('verdict.stoppedHint'), action: logs };
  }

  if (!runtime.live) {
    if (runtime.awaiting && !runtime.overdue) {
      return { tone: VERDICT_TONE.Idle, title: t('verdict.waiting'), hint: t('verdict.waitingHint'), action: null };
    }

    return runtime.daemonLive
      ? { tone: VERDICT_TONE.Bad, title: t('verdict.silent'), hint: t('verdict.silentHint'), action: logs }
      : { tone: VERDICT_TONE.Idle, title: t('verdict.offline'), hint: t('verdict.offlineHint'), action: null };
  }

  const failed = (proxies.data?.groups ?? []).some((group) =>
    group.nodes.some((node) => node.name === group.now && node.delayState === DELAY_STATE.Failed)
  );

  if (failed) {
    return {
      tone: VERDICT_TONE.Warn,
      title: t('verdict.nodeDown'),
      hint: t('verdict.nodeDownHint'),
      action: { to: '/proxies', label: t('verdict.action.proxies') },
    };
  }

  const system = runtime.system;
  const hottest = system === null ? 0 : system.thermal.reduce((max, zone) => Math.max(max, zone.celsius), 0);
  const celsius = Math.round(hottest);

  if (hottest >= HOT_CELSIUS) {
    return {
      tone: VERDICT_TONE.Bad,
      title: t('verdict.hot', { celsius }),
      hint: t('verdict.hotHint', { limit: HOT_CELSIUS }),
      action: null,
    };
  }

  if (hottest >= WARM_CELSIUS) {
    return {
      tone: VERDICT_TONE.Warn,
      title: t('verdict.warm', { celsius }),
      hint: t('verdict.warmHint', { limit: HOT_CELSIUS }),
      action: null,
    };
  }

  return { tone: VERDICT_TONE.Ok, title: t('verdict.ok'), hint: t('verdict.okHint'), action: null };
}
