import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  ConnectionState,
  useConnectionCounts,
  type ConnectionSummary,
  type ConnectionTotals,
} from '@entities/Connection';
import {
  RuntimeState,
  SERVICE_STATUS,
  useServiceState,
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
  memoryHistory: number[];
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
  counts: { active: number; closed: number };
  /** Кадры рантайма приходят прямо сейчас. */
  live: boolean;
  /** Ни одного кадра ещё не было: экран показывает ожидание, а не нули. */
  awaiting: boolean;
  /** Когда пришёл последний кадр трафика, миллисекунды эпохи. */
  sampledAt: number | null;
  /** Снимка соединений ещё не было: счётчики показывают загрузку, а не ноль. */
  connectionsAwaiting: boolean;
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
  const memoryHistory = RuntimeState.use.memory();
  const sampledAt = RuntimeState.use.sampledAt();
  const system = RuntimeState.use.system();
  const uplink = RuntimeState.use.uplink();
  const totals = ConnectionState.use.totals();
  const summary = ConnectionState.use.summary();
  const history = ConnectionState.use.history();
  const counts = useConnectionCounts();
  const connectionsAt = ConnectionState.use.sampledAt();

  // Обрыв потока сам о себе не сообщает: кадры просто перестают приходить, и
  // без своего тика экран навсегда остался бы с последним «живым» состоянием.
  const [checkedAt, setCheckedAt] = useState(() => Date.now());

  useEffect(function watchFreshness() {
    const timer = setInterval(function checkFreshness() {
      setCheckedAt(Date.now());
    }, FRESHNESS_TICK);

    return function stopFreshness() {
      clearInterval(timer);
    };
  }, []);

  const peaks = useMemo(
    () => ({
      down: traffic.reduce((max, sample) => Math.max(max, sample.down), 0),
      up: traffic.reduce((max, sample) => Math.max(max, sample.up), 0),
    }),
    [traffic]
  );

  return {
    traffic,
    now,
    peakDown: peaks.down,
    peakUp: peaks.up,
    memory,
    memoryHistory,
    totals,
    system,
    uplink,
    share: system?.share ?? NO_SHARE,
    summary,
    history,
    counts,
    live: sampledAt !== null && Math.max(checkedAt, sampledAt) - sampledAt < STALE_AFTER,
    awaiting: sampledAt === null,
    sampledAt,
    connectionsAwaiting: connectionsAt === null,
  };
}

/** Выше этого плата уже уходит в троттлинг. */
export const HOT_CELSIUS = 85;
const WARM_CELSIUS = 70;

export const VERDICT_TONE = {
  Ok: 'ok',
  Warn: 'warn',
  Bad: 'bad',
} as const;

export type VerdictTone = (typeof VERDICT_TONE)[keyof typeof VERDICT_TONE];

export interface Verdict {
  tone: VerdictTone;
  text: string;
}

/**
 * Одна строка ответа на вопрос, ради которого экран открывают: всё ли в
 * порядке. Собирается из сигналов, которые экран и так показывает, — своего
 * источника у неё нет. Порядок значим: сначала то, что делает остальные числа
 * недостоверными.
 */
export function useOverviewVerdict(system: SystemStat | null, live: boolean, awaiting: boolean): Verdict {
  const { t } = useTranslation('pages/Overview');
  const service = useServiceState();
  const proxies = useProxies();

  if (awaiting) {
    return { tone: VERDICT_TONE.Warn, text: t('verdict.waiting') };
  }

  if (!live) {
    return { tone: VERDICT_TONE.Bad, text: t('verdict.silent') };
  }

  if (service.data !== undefined && service.data.status !== SERVICE_STATUS.Running) {
    return { tone: VERDICT_TONE.Bad, text: t('verdict.stopped') };
  }

  const failed = (proxies.data?.groups ?? []).some((group) =>
    group.nodes.some((node) => node.name === group.now && node.delayState === DELAY_STATE.Failed)
  );

  if (failed) {
    return { tone: VERDICT_TONE.Warn, text: t('verdict.nodeDown') };
  }

  const hottest = system === null ? 0 : system.thermal.reduce((max, zone) => Math.max(max, zone.celsius), 0);

  if (hottest >= HOT_CELSIUS) {
    return { tone: VERDICT_TONE.Bad, text: t('verdict.hot', { celsius: Math.round(hottest) }) };
  }

  if (hottest >= WARM_CELSIUS) {
    return { tone: VERDICT_TONE.Warn, text: t('verdict.warm', { celsius: Math.round(hottest) }) };
  }

  return { tone: VERDICT_TONE.Ok, text: t('verdict.ok') };
}
