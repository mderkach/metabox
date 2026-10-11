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
 * Сколько секунд без кадра считаем обрывом. Поток идёт раз в секунду, но
 * свёрнутая вкладка отдаёт кадры пачками — порог взят с запасом.
 */
const STALE_SECONDS = 8;
const STALE_AFTER = STALE_SECONDS * MS_IN_SECOND;

/** Как часто перепроверяется свежесть: без тика замерший поток некому заметить. */
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
  /** Показания устройства; `null` — снимок ещё не приходил. */
  system: SystemStat | null;
  /** Скорость интерфейса наружу прямо сейчас. */
  uplink: UplinkRate;
  /** Объёмы канала и sing-box за окно наблюдения демона. */
  share: TrafficShare;
  summary: ConnectionSummary;
  /** Число открытых соединений за минуту. */
  history: number[];
  /** Когда получена последняя точка `history`: от неё считается время графика. */
  historyAt: number | null;
  /** Пик открытых соединений за видимую минуту. */
  historyPeak: number;
  counts: { active: number; closed: number };
  /** Кадры рантайма приходят прямо сейчас. */
  live: boolean;
  /** Ни одного кадра ещё не было: экран показывает ожидание, а не нули. */
  awaiting: boolean;
  /** Снимки устройства приходят прямо сейчас: их шлёт демон и без sing-box. */
  daemonLive: boolean;
  /** Экран открыт дольше порога обрыва, а первого кадра трафика так и нет. */
  overdue: boolean;
  /** Когда пришёл последний кадр трафика, миллисекунды эпохи. */
  sampledAt: number | null;
  /** Когда получена последняя точка трафика: от неё считается время графика. */
  trafficAt: number | null;
  /** Снимка соединений ещё не было: счётчики показывают загрузку, а не ноль. */
  connectionsAwaiting: boolean;
}

function isFresh(at: number | null, checkedAt: number): boolean {
  return at !== null && Math.max(checkedAt, at) - at < STALE_AFTER;
}

/**
 * Данные экрана обзора из двух потоков рантайма. Собраны хуком, а не
 * селекторами по месту: панелей на экране десяток, и подписка у каждой своя
 * развела бы их рендеры по разным кадрам одного и того же снапшота.
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

  // Графики минуты открываются тем, что копил демон, а не пустыми: панель
  // открывают не всегда, а поток знает только то, что было при открытой вкладке.
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

  // Обрыв потока сам о себе не сообщает: кадры просто перестают приходить, и
  // без своего тика экран навсегда остался бы с последним «живым» состоянием.
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

  // Буфер длиннее окна на точки за левой кромкой: пик минуты считается только по видимым.
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

/** Выше этого плата уже уходит в троттлинг. */
export const HOT_CELSIUS = 85;
const WARM_CELSIUS = 70;

export const VERDICT_TONE = {
  Ok: 'ok',
  /** Панель ждёт данные или переподключается: о самом роутере это ничего не говорит. */
  Idle: 'idle',
  Warn: 'warn',
  Bad: 'bad',
} as const;

export type VerdictTone = (typeof VERDICT_TONE)[keyof typeof VERDICT_TONE];

export interface Verdict {
  tone: VerdictTone;
  title: string;
  /** Что это значит и что делать. */
  hint: string;
  /** Куда идти разбираться; `null` — разбираться негде или незачем. */
  action: { to: LinkProps['to']; label: string } | null;
}

/**
 * Ответ на вопрос, ради которого экран открывают: всё ли в порядке. Собирается
 * из сигналов, которые экран и так показывает, — своего источника у него нет.
 *
 * Порядок значим: сначала то, что делает остальные числа недостоверными. Обрыв
 * связи панели с демоном — нейтральный тон: роутер при этом может работать
 * исправно. Тревога — только то, что подтвердил демон: служба остановлена или
 * демон шлёт снимки устройства, а трафика от sing-box нет.
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
