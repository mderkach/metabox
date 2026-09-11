/**
 * Адрес потока из относительного пути. Схема берётся у страницы: панель ходит
 * к демону по тому же origin, что и сама, и захардкоженный `ws://` сломал бы
 * её под TLS.
 */
export function toWebSocketUrl(path: string): string {
  const url = new URL(path, globalThis.location.href);

  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';

  return url.toString();
}
