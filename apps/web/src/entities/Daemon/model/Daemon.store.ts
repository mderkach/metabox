import { useEffect } from 'react';

import { createReactSelectors, stateCreator, useStore } from '@shared/lib/state';
import { MS_IN_SECOND, SECONDS_IN_MINUTE } from '@shared/lib/time';

import type { MemorySample, SystemStat, TrafficSample, UplinkRate } from './Daemon.model';

/** The daemon sends a traffic frame once a second; the frame has no time of its own. */
export const TRAFFIC_STEP_SECONDS = 1;

/**
 * Traffic chart window in seconds, exactly a minute, as for the connections
 * chart: the axis labels of both end at "-60 s".
 */
export const TRAFFIC_WINDOW_SECONDS = SECONDS_IN_MINUTE;

/** Points in the chart window: the minute peak is computed from them. */
export const TRAFFIC_WINDOW_POINTS = TRAFFIC_WINDOW_SECONDS / TRAFFIC_STEP_SECONDS;

/**
 * Points beyond the left edge of the window. The right edge lags "now" by a
 * step, and a buffer of exactly the window size would start inside the chart:
 * the area would move away from the left edge and jump once a second after the
 * dropped point. One point covers the lag, the second gives the segment cut by
 * the edge a start.
 */
const TRAFFIC_OFFSCREEN_POINTS = 2;

export const TRAFFIC_POINTS = TRAFFIC_WINDOW_POINTS + TRAFFIC_OFFSCREEN_POINTS;

/**
 * Buffer point time in epoch seconds. Counted back from the arrival of the last
 * point with the stream step, not from the arrival of each: a collapsed tab
 * delivers accumulated frames in a batch, and by arrival time they would stick
 * into one second.
 */
export function toTrafficTimes(count: number, lastAt: number): number[] {
  const last = lastAt / MS_IN_SECOND;

  return Array.from({ length: count }, (_, index) => last - (count - 1 - index) * TRAFFIC_STEP_SECONDS);
}

/** Memory is shown over ten minutes: we take every tenth sample. */
export const MEMORY_EVERY = 10;
export const MEMORY_POINTS = SECONDS_IN_MINUTE;

/**
 * Bounds of a plausible interval between device snapshots. A collapsed tab
 * accumulates frames and delivers them in a batch: the interval between them is
 * near zero with a large byte delta, and the channel speed would come out
 * fantastic.
 */
const MIN_INTERVAL = 0.5;
const MAX_INTERVAL = 30;

const NO_UPLINK_RATE: UplinkRate = { rx: 0, tx: 0 };

/** The interface counter only grows; after link up it starts from zero. */
function toRate(current: number, previous: number, seconds: number): number {
  return Math.max(0, (current - previous) / seconds);
}

interface RuntimeState {
  /** Ring buffer: the stream history is not accumulated, the screen needs the tail. */
  traffic: TrafficSample[];
  memory: number[];
  /** Last memory sample, even if it has not yet got into the buffer. */
  memoryNow: number;
  /** Latest device readings; `null` means no snapshot has arrived yet. */
  system: SystemStat | null;
  /**
   * Outward interface speed over the interval between snapshots. Computed by
   * the panel: the daemon serves counters since link up, and the channel share
   * through sing-box is compared only by increments of one window.
   */
  uplink: UplinkRate;
  /**
   * When the last runtime frame arrived. It shows that the stream broke:
   * without this mark frozen numbers are indistinguishable from quiet traffic.
   */
  sampledAt: number | null;
  /**
   * When the last traffic point was received, from the stream or as a minute
   * from the daemon. The chart point time is computed from it; stream liveness
   * is not judged by it.
   */
  trafficAt: number | null;
  /**
   * When the last device snapshot arrived. It is taken by the daemon, not by
   * sing-box: a fresh snapshot with frozen traffic means the stream is alive
   * and sing-box is silent, while if both froze, the panel connection to the
   * daemon broke.
   */
  systemAt: number | null;
  /** How many screens watch the runtime stream. */
  readers: number;
  pushTraffic: (sample: TrafficSample) => void;
  /**
   * Fills an empty buffer with the last minute the daemon accumulated: the
   * chart opens full instead of starting from the moment the tab was opened. A
   * buffer the stream has already written to is not touched.
   */
  seedTraffic: (samples: TrafficSample[]) => void;
  pushMemory: (sample: MemorySample) => void;
  pushSystem: (stat: SystemStat) => void;
  addReader: () => void;
  removeReader: () => void;
  /**
   * The stream is closed: the last frame mark is cleared, the buffers stay.
   * Otherwise a screen opened again would judge liveness by a frame from a
   * previous connection and show a frozen stream until the first new one
   * arrives.
   */
  closeStream: () => void;
  reset: () => void;
}

const RuntimeStateProto = stateCreator<RuntimeState>((set) => {
  let memoryTick = 0;
  // The previous interface snapshot lives outside the state: it is needed only
  // for the speed calculation, and nobody subscribes to it.
  let sampledAt: number | null = null;

  return {
    traffic: [],
    memory: [],
    memoryNow: 0,
    system: null,
    uplink: NO_UPLINK_RATE,
    sampledAt: null,
    trafficAt: null,
    systemAt: null,
    readers: 0,
    pushTraffic: (sample) => {
      const receivedAt = Date.now();

      set((state) => ({
        sampledAt: receivedAt,
        trafficAt: receivedAt,
        traffic: [...state.traffic, sample].slice(-TRAFFIC_POINTS),
      }));
    },
    seedTraffic: (samples) => {
      set((state) =>
        state.traffic.length > 0 || samples.length === 0
          ? state
          : { traffic: samples.slice(-TRAFFIC_POINTS), trafficAt: Date.now() }
      );
    },
    pushMemory: (sample) => {
      // The first stream sample is always zero: showing it would be lying that
      // sing-box takes no memory.
      if (sample.inuse === 0) {
        return;
      }

      memoryTick += 1;

      set((state) => {
        const kept = memoryTick % MEMORY_EVERY !== 1 && state.memory.length > 0;

        return {
          memoryNow: sample.inuse,
          memory: kept ? state.memory : [...state.memory, sample.inuse].slice(-MEMORY_POINTS),
        };
      });
    },
    pushSystem: (stat) => {
      const receivedAt = Date.now();

      set((state) => {
        const link = stat.uplink;
        const previous = state.system?.uplink;
        const seconds = sampledAt === null ? 0 : (receivedAt - sampledAt) / MS_IN_SECOND;
        const measurable = seconds >= MIN_INTERVAL && seconds <= MAX_INTERVAL;
        // An interface change resets the comparison: the new one has its own counters.
        const comparable = previous !== undefined && link !== undefined && measurable && link.name === previous.name;

        sampledAt = receivedAt;

        return {
          uplink: comparable
            ? { rx: toRate(link.rx, previous.rx, seconds), tx: toRate(link.tx, previous.tx, seconds) }
            : NO_UPLINK_RATE,
          system: stat,
          systemAt: receivedAt,
        };
      });
    },
    addReader: () => {
      set((state) => ({ readers: state.readers + 1 }));
    },
    removeReader: () => {
      set((state) => ({ readers: Math.max(0, state.readers - 1) }));
    },
    closeStream: () => {
      set({ sampledAt: null, systemAt: null });
    },
    reset: () => {
      memoryTick = 0;
      sampledAt = null;

      set({
        traffic: [],
        memory: [],
        memoryNow: 0,
        system: null,
        uplink: NO_UPLINK_RATE,
        sampledAt: null,
        trafficAt: null,
        systemAt: null,
      });
    },
  };
}, 'DaemonRuntime');

export const RuntimeState = createReactSelectors(RuntimeStateProto);

/** Store outside React: the stream handlers live outside the component tree. */
export const RuntimeStore = RuntimeStateProto;

export function useTrafficNow(): TrafficSample {
  return useStore(RuntimeStateProto, (state) => state.traffic.at(-1) ?? { up: 0, down: 0 });
}

/**
 * A screen declares that it watches the runtime. The shell opens the stream:
 * there is no need to keep it open on all screens, since samples arrive every
 * second.
 */
export function useRuntimeStream(): void {
  useEffect(function countRuntimeReader() {
    const { addReader, removeReader } = RuntimeStore.getState();

    addReader();

    return removeReader;
  }, []);
}
