import { listenTopic, RUNTIME_TOPIC, type StreamSource } from '@shared/api';

import { RuntimeStore } from '../model/Daemon.store';
import type { ClashMemorySample, ClashTrafficSample, ServiceState } from './Daemon.dto';

/**
 * Трафик и память приходят топиками единого потока (ADR-0010). Копить их
 * пачкой незачем: сэмпл — два числа раз в секунду, пачка нужна там, где
 * сообщение весит десятки килобайт.
 */
export function listenTraffic(source: StreamSource): () => void {
  return listenTopic<ClashTrafficSample>(source, RUNTIME_TOPIC.Traffic, (sample) => {
    RuntimeStore.getState().pushTraffic(sample);
  });
}

export function listenMemory(source: StreamSource): () => void {
  return listenTopic<ClashMemorySample>(source, RUNTIME_TOPIC.Memory, (sample) => {
    RuntimeStore.getState().pushMemory(sample);
  });
}

/**
 * Состояние службы в потоке и в ручке `/api/service` — одно и то же тело
 * (ADR-0010), поэтому событие кладётся в кэш запроса: экран продолжает читать
 * состояние своим хуком и не знает, пришло оно потоком или запросом.
 */
export function listenService(source: StreamSource, apply: (state: ServiceState) => void): () => void {
  return listenTopic<ServiceState>(source, RUNTIME_TOPIC.Service, apply);
}
