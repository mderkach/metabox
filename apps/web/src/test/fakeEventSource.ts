import { RUNTIME_TOPIC, type RuntimeTopic, type StreamSource } from '@shared/api';

/**
 * Фейковый источник событий для тестов потока. Проверяется обработчик, а не
 * транспорт: `EventSource` в jsdom нет вовсе, а сервер ради разбора конверта
 * ничего к проверке не добавил бы.
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
    /** Событие в конверте демона: топик, номер и данные. */
    send: (topic: RuntimeTopic, data: unknown) => {
      seq += 1;
      emit(topic, JSON.stringify({ topic, seq, data }));
    },
    /** Кадр как есть: обрыв соединения приходит обрезанным текстом. */
    sendRaw: (topic: RuntimeTopic, frame: string) => {
      emit(topic, frame);
    },
    count: (topic: RuntimeTopic = RUNTIME_TOPIC.Connections) => listeners.get(topic)?.size ?? 0,
  };
}
