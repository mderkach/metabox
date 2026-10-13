import { RUNTIME_TOPIC, type RuntimeTopic, type StreamSource } from '@shared/api';

/**
 * Fake event source for stream tests. The handler is tested, not
 * the transport: jsdom has no `EventSource` at all, and a server would add
 * nothing to checking envelope parsing.
 */
export function fakeEventSource() {
  const listeners = new Map<string, Set<(event: MessageEvent<string>) => void>>();

  const source: StreamSource = {
    addEventListener: (type, handler) => {
      const topic = listeners.get(type) ?? new Set();

      topic.add(handler);
      listeners.set(type, topic);
    },
    removeEventListener: (type, handler) => {
      listeners.get(type)?.delete(handler);
    },
  };

  let seq = 0;

  const emit = (topic: string, data: string) => {
    for (const handler of listeners.get(topic) ?? []) {
      handler(new MessageEvent(topic, { data }));
    }
  };

  return {
    source,
    /** Event in the daemon envelope: topic, number and data. */
    send: (topic: RuntimeTopic, data: unknown) => {
      seq += 1;
      emit(topic, JSON.stringify({ topic, seq, data }));
    },
    /** Frame as is: a connection drop arrives as truncated text. */
    sendRaw: (topic: RuntimeTopic, frame: string) => {
      emit(topic, frame);
    },
    count: (topic: RuntimeTopic = RUNTIME_TOPIC.Connections) => listeners.get(topic)?.size ?? 0,
  };
}
