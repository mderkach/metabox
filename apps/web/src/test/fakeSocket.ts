import type { StreamSocket } from '@shared/api';

/**
 * Фейковый сокет для тестов потоков. Проверяется обработчик, а не транспорт:
 * настоящий `WebSocket` в jsdom потребовал бы сервера, ничего не добавив к
 * проверке разбора кадров.
 */
export function fakeSocket() {
  const listeners = new Set<(event: MessageEvent<string>) => void>();

  const socket: StreamSocket = {
    addEventListener: (_type, handler) => {
      listeners.add(handler);
    },
    removeEventListener: (_type, handler) => {
      listeners.delete(handler);
    },
  };

  const emit = (data: string) => {
    for (const handler of listeners) {
      handler(new MessageEvent('message', { data }));
    }
  };

  return {
    socket,
    send: (data: unknown) => {
      emit(JSON.stringify(data));
    },
    /** Кадр как есть: обрыв соединения приходит обрезанным текстом, не объектом. */
    sendRaw: emit,
    get count() {
      return listeners.size;
    },
  };
}
