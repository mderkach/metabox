import { listenTopic, RUNTIME_TOPIC, type StreamSource } from '@shared/api';

import { toMemoryFrame, toServiceFrame, toSystemFrame, toTrafficFrame } from '../model/Daemon.adapter';
import { RuntimeStore } from '../model/Daemon.store';
import type { ServiceStateWire } from './Daemon.schema';

/**
 * Traffic and memory arrive as topics of the single stream. There is no need to
 * accumulate them in a batch: a sample is two numbers once a second, and a
 * batch is needed where a message weighs tens of kilobytes.
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

/** Device readings go through the same stream as traffic. */
export function listenSystem(source: StreamSource): () => void {
  return listenTopic(source, RUNTIME_TOPIC.System, (frame) => {
    const stat = toSystemFrame(frame);

    if (stat !== null) {
      RuntimeStore.getState().pushSystem(stat);
    }
  });
}

/**
 * The service state in the stream and in the `/api/service` endpoint is the
 * same body, so the event is put into the query cache: the screen keeps reading
 * the state with its own hook and does not know whether it came from the stream
 * or from a request.
 */
export function listenService(source: StreamSource, apply: (state: ServiceStateWire) => void): () => void {
  return listenTopic(source, RUNTIME_TOPIC.Service, (frame) => {
    const state = toServiceFrame(frame);

    if (state !== null) {
      apply(state);
    }
  });
}
