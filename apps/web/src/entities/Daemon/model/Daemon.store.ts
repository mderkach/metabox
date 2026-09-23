import { useEffect } from 'react';

import { createReactSelectors, stateCreator, useStore } from '@shared/lib/state';
import { MS_IN_SECOND, SECONDS_IN_MINUTE } from '@shared/lib/time';

import type { MemorySample, SystemStat, TrafficSample, UplinkRate } from './Daemon.model';

/** Демон шлёт кадр трафика раз в секунду; своего времени у кадра нет. */
export const TRAFFIC_STEP_SECONDS = 1;

/** Минута трафика при шаге снапшота в секунду. */
export const TRAFFIC_POINTS = SECONDS_IN_MINUTE / TRAFFIC_STEP_SECONDS;

/**
 * Окно графика на шаг короче буфера: при заполненном буфере левая кромка
 * иначе шла бы за первой точкой, которая уходит раз в шаг, и ось сдвигалась
 * бы рывками.
 */
export const TRAFFIC_WINDOW_SECONDS = (TRAFFIC_POINTS - 1) * TRAFFIC_STEP_SECONDS;

/**
 * Время точек буфера в секундах эпохи. Считается от прихода последней точки
 * назад с шагом потока, а не от прихода каждой: свёрнутая вкладка отдаёт
 * накопленные кадры пачкой, и по времени прихода они слиплись бы в одну
 * секунду.
 */
export function toTrafficTimes(count: number, lastAt: number): number[] {
  const last = lastAt / MS_IN_SECOND;

  return Array.from({ length: count }, (_, index) => last - (count - 1 - index) * TRAFFIC_STEP_SECONDS);
}

/** Память показывается за десять минут: берём каждый десятый сэмпл. */
export const MEMORY_EVERY = 10;
export const MEMORY_POINTS = SECONDS_IN_MINUTE;

/**
 * Границы правдоподобного интервала между снимками устройства. Свёрнутая
 * вкладка копит кадры и отдаёт их пачкой: интервал между ними околонулевой при
 * большой дельте байт, и скорость канала вышла бы фантастической.
 */
const MIN_INTERVAL = 0.5;
const MAX_INTERVAL = 30;

const NO_UPLINK_RATE: UplinkRate = { rx: 0, tx: 0 };

/** Счётчик интерфейса только растёт; после подъёма линка он начинается с нуля. */
function toRate(current: number, previous: number, seconds: number): number {
  return Math.max(0, (current - previous) / seconds);
}

interface RuntimeState {
  /** Кольцевой буфер: история потока не копится, экрану нужен хвост. */
  traffic: TrafficSample[];
  memory: number[];
  /** Последний сэмпл памяти, даже если в буфер он ещё не попал. */
  memoryNow: number;
  /** Последние показания устройства; `null` — снимок ещё не приходил. */
  system: SystemStat | null;
  /**
   * Скорость интерфейса наружу за интервал между снимками. Считает панель:
   * демон отдаёт счётчики с подъёма линка, а доля канала через sing-box
   * сравнивается только по приращениям одного окна.
   */
  uplink: UplinkRate;
  /**
   * Когда пришёл последний кадр рантайма. По нему видно, что поток оборвался:
   * без этой отметки замершие числа неотличимы от затихшего трафика.
   */
  sampledAt: number | null;
  /** Сколько экранов смотрит поток рантайма. */
  readers: number;
  pushTraffic: (sample: TrafficSample) => void;
  pushMemory: (sample: MemorySample) => void;
  pushSystem: (stat: SystemStat) => void;
  addReader: () => void;
  removeReader: () => void;
  reset: () => void;
}

const RuntimeStateProto = stateCreator<RuntimeState>((set) => {
  let memoryTick = 0;
  // Прошлый снимок интерфейса живёт вне состояния: он нужен только для счёта
  // скорости, и подписки на него никто не делает.
  let sampledAt: number | null = null;

  return {
    traffic: [],
    memory: [],
    memoryNow: 0,
    system: null,
    uplink: NO_UPLINK_RATE,
    sampledAt: null,
    readers: 0,
    pushTraffic: (sample) => {
      const receivedAt = Date.now();

      set((state) => ({
        sampledAt: receivedAt,
        traffic: [...state.traffic, sample].slice(-TRAFFIC_POINTS),
      }));
    },
    pushMemory: (sample) => {
      // Первый сэмпл потока всегда нулевой: показать его значило
      // бы соврать, что sing-box не занимает памяти.
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
        // Смена интерфейса сбрасывает сравнение: счётчики у нового свои.
        const comparable = previous !== undefined && link !== undefined && measurable && link.name === previous.name;

        sampledAt = receivedAt;

        return {
          uplink: comparable
            ? { rx: toRate(link.rx, previous.rx, seconds), tx: toRate(link.tx, previous.tx, seconds) }
            : NO_UPLINK_RATE,
          system: stat,
        };
      });
    },
    addReader: () => {
      set((state) => ({ readers: state.readers + 1 }));
    },
    removeReader: () => {
      set((state) => ({ readers: Math.max(0, state.readers - 1) }));
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
      });
    },
  };
}, 'DaemonRuntime');

export const RuntimeState = createReactSelectors(RuntimeStateProto);

/** Стор снаружи React: обработчики потоков живут вне дерева компонентов. */
export const RuntimeStore = RuntimeStateProto;

export function useTrafficNow(): TrafficSample {
  return useStore(RuntimeStateProto, (state) => state.traffic.at(-1) ?? { up: 0, down: 0 });
}

/**
 * Экран объявляет, что смотрит рантайм. Поток открывает оболочка: держать его
 * открытым на всех экранах незачем — сэмплы идут каждую секунду.
 */
export function useRuntimeStream(): void {
  useEffect(function countRuntimeReader() {
    const { addReader, removeReader } = RuntimeStore.getState();

    addReader();

    return removeReader;
  }, []);
}
