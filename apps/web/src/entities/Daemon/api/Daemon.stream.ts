import { listenTopic, RUNTIME_TOPIC, type StreamSource } from '@shared/api';

import { toMemoryFrame, toServiceFrame, toTrafficFrame } from '../model/Daemon.adapter';
import { RuntimeStore } from '../model/Daemon.store';
import type { ServiceStateWire } from './Daemon.schema';

/**
 * Трафик и память приходят топиками единого потока (ADR-0010). Копить их
 * пачкой незачем: сэмпл — два числа раз в секунду, пачка нужна там, где
 * сообщение весит десятки килобайт.
 */
export function listenTraffic(source: StreamSource): () => void {
  return listenTopic(source, RUNTIME_TOPIC.Traffic, (frame) => {
    const sample = toTrafficFrame(frame);

    if (sample !== null) {
      RuntimeStore.getState().pushTraffic(sample);
    }
  });
}

export function listenMemory(source: StreamSource): () => void {
  return listenTopic(source, RUNTIME_TOPIC.Memory, (frame) => {
    const sample = toMemoryFrame(frame);

    if (sample !== null) {
      RuntimeStore.getState().pushMemory(sample);
    }
  });
}

/**
 * Состояние службы в потоке и в ручке `/api/service` — одно и то же тело
 * (ADR-0010), поэтому событие кладётся в кэш запроса: экран продолжает читать
 * состояние своим хуком и не знает, пришло оно потоком или запросом.
 */
export function listenService(source: StreamSource, apply: (state: ServiceStateWire) => void): () => void {
  return listenTopic(source, RUNTIME_TOPIC.Service, (frame) => {
    const state = toServiceFrame(frame);

    if (state !== null) {
      apply(state);
    }
  });
}
