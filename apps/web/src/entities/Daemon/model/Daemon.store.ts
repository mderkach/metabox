import { useEffect } from 'react';

import { createReactSelectors, stateCreator, useStore } from '@shared/lib/state';

import type { ClashMemorySample, ClashTrafficSample } from '../api/Daemon.dto';

/** Минута трафика при шаге снапшота в секунду. */
export const TRAFFIC_POINTS = 60;

/** Память показывается за десять минут: берём каждый десятый сэмпл. */
export const MEMORY_POINTS = 60;
export const MEMORY_EVERY = 10;

interface RuntimeState {
  /** Кольцевой буфер: история потока не копится, экрану нужен хвост. */
  traffic: ClashTrafficSample[];
  memory: number[];
  /** Последний сэмпл памяти, даже если в буфер он ещё не попал. */
  memoryNow: number;
  /** Сколько экранов смотрит поток рантайма. */
  readers: number;
  pushTraffic: (sample: ClashTrafficSample) => void;
  pushMemory: (sample: ClashMemorySample) => void;
  addReader: () => void;
  removeReader: () => void;
  reset: () => void;
}

const RuntimeStateProto = stateCreator<RuntimeState>((set) => {
  let memoryTick = 0;

  return {
    traffic: [],
    memory: [],
    memoryNow: 0,
    readers: 0,
    pushTraffic: (sample) => {
      set((state) => {
        state.traffic.push(sample);

        if (state.traffic.length > TRAFFIC_POINTS) {
          state.traffic.shift();
        }
      });
    },
    pushMemory: (sample) => {
      // Первый сэмпл потока всегда нулевой (PRD, OQ-5): показать его значило
      // бы соврать, что sing-box не занимает памяти.
      if (sample.inuse === 0) {
        return;
      }

      memoryTick += 1;

      set((state) => {
        state.memoryNow = sample.inuse;

        if (memoryTick % MEMORY_EVERY !== 1 && state.memory.length > 0) {
          return;
        }

        state.memory.push(sample.inuse);

        if (state.memory.length > MEMORY_POINTS) {
          state.memory.shift();
        }
      });
    },
    addReader: () => {
      set((state) => {
        state.readers += 1;
      });
    },
    removeReader: () => {
      set((state) => {
        state.readers = Math.max(0, state.readers - 1);
      });
    },
    reset: () => {
      memoryTick = 0;

      set((state) => {
        state.traffic = [];
        state.memory = [];
        state.memoryNow = 0;
      });
    },
  };
}, 'DaemonRuntime');

export const RuntimeState = createReactSelectors(RuntimeStateProto);

/** Стор снаружи React: обработчики потоков живут вне дерева компонентов. */
export const RuntimeStore = RuntimeStateProto;

export function useTrafficNow(): ClashTrafficSample {
  return useStore(RuntimeStateProto, (state) => state.traffic.at(-1) ?? { up: 0, down: 0 });
}

/**
 * Экран объявляет, что смотрит потоки трафика и памяти. Сокеты открывает
 * оболочка: держать их открытыми на всех экранах незачем — сэмплы идут каждую
 * секунду.
 */
export function useRuntimeStream(): void {
  useEffect(function countRuntimeReader() {
    const { addReader, removeReader } = RuntimeStore.getState();

    addReader();

    return removeReader;
  }, []);
}
