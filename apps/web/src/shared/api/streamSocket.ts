/**
 * Всё, что обработчику потока нужно от сокета. Узкий тип вместо `WebSocket`:
 * так обработчик проверяется без транспорта, а подмена в тесте не изображает
 * протокол целиком.
 */
export interface StreamSocket {
  addEventListener: (type: 'message', handler: (event: MessageEvent<string>) => void) => void;
  removeEventListener: (type: 'message', handler: (event: MessageEvent<string>) => void) => void;
}
