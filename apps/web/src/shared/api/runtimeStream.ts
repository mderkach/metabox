import { z } from 'zod';

import { EventSchema } from './daemon.generated';

/**
 * Runtime stream topics. The panel subscribes to all at once: the stream has no separate
 * per-topic subscription.
 */
export const RUNTIME_TOPIC = {
  Traffic: 'traffic',
  Memory: 'memory',
  Connections: 'connections',
  Service: 'service',
  System: 'system',
} as const;

export type RuntimeTopic = (typeof RUNTIME_TOPIC)[keyof typeof RUNTIME_TOPIC];

export { EventSchema as RuntimeEventSchema } from './daemon.generated';
export type { EventWire as RuntimeEvent } from './daemon.generated';

/**
 * Everything the handler needs from the stream. A narrow type instead of `EventSource`: this way
 * the handler is tested without transport, and a test double does not pretend to be
 * the whole protocol — jsdom has no `EventSource` at all.
 */
export interface StreamSource {
  addEventListener: (type: string, handler: (event: MessageEvent<string>) => void) => void;
  removeEventListener: (type: string, handler: (event: MessageEvent<string>) => void) => void;
}

type ParsedEnvelope = ReturnType<typeof EventSchema.safeParse> | null;

/**
 * Envelopes by event. The browser hands one event object to every listener of its topic,
 * so the sequence watch and the topic subscription share one parse of a frame of up to
 * ~10 MB instead of parsing it each. `null` is a frame that is not JSON.
 */
const envelopes = new WeakMap<MessageEvent<string>, ParsedEnvelope>();

function parseEnvelope(event: MessageEvent<string>): ParsedEnvelope {
  const cached = envelopes.get(event);

  if (cached !== undefined) {
    return cached;
  }

  const value = safeJson(event.data);
  const envelope = value === undefined ? null : EventSchema.safeParse(value);

  envelopes.set(event, envelope);

  return envelope;
}

/**
 * Tracks envelope numbering and calls `onGap` when numbers diverge:
 * the daemon counts `seq` per reader without gaps, so a gap
 * means a dropped event, not delivery order. The counter
 * is shared per subscription, so it must be checked across all topics at once.
 */
export function watchSequence(source: StreamSource, onGap: () => void): () => void {
  let expected: number | null = null;

  const handler = (event: MessageEvent<string>) => {
    const envelope = parseEnvelope(event);

    if (envelope === null || !envelope.success) {
      return;
    }

    const { seq } = envelope.data;

    if (expected !== null && seq !== expected) {
      onGap();
    }

    expected = seq + 1;
  };

  for (const topic of Object.values(RUNTIME_TOPIC)) {
    source.addEventListener(topic, handler);
  }

  return () => {
    for (const topic of Object.values(RUNTIME_TOPIC)) {
      source.removeEventListener(topic, handler);
    }
  };
}

/** `undefined` is a frame that is not JSON: `null` is valid JSON. */
function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Subscription to a stream topic. Returns an unsubscribe function: without it the handler
 * would outlive the unmount, and every reopening of the screen would add one more
 * parse of the same events.
 *
 * Data is taken out of the envelope here: the slice gets its topic, not the shape of the
 * transport.
 */
export function listenTopic(source: StreamSource, topic: RuntimeTopic, apply: (data: unknown) => void): () => void {
  const handler = (event: MessageEvent<string>) => {
    try {
      const envelope = parseEnvelope(event);

      if (envelope === null) {
        return;
      }

      if (!envelope.success) {
        console.warn(`[STREAM] envelope of topic ${topic} not parsed`, z.prettifyError(envelope.error));

        return;
      }

      apply(envelope.data.data);
    } catch {
      // A broken frame is skipped: the next one comes in a second.
    }
  };

  source.addEventListener(topic, handler);

  return () => {
    source.removeEventListener(topic, handler);
  };
}
