import { http, HttpResponse, ws } from 'msw';

import { API_ENDPOINT } from '@shared/api';

import { CLASH_CONNECTIONS_FIXTURE } from './Connection.fixture';

/** Шаг потока на устройстве — замер 2026-09-10: снапшот примерно раз в секунду. */
const STREAM_INTERVAL = 1000;

/**
 * Адрес потока матчится регуляркой: хост панель берёт из `location`, а `ws.link`
 * принимает только точный URL или `RegExp` — звёздочки в строке он не понимает
 * и молча не совпадает.
 */
const connectionsStream = ws.link(new RegExp(`^wss?://[^/]+${API_ENDPOINT.clashConnections()}$`));

export const connectionHandlers = [
  http.get(API_ENDPOINT.clashConnections(), () => HttpResponse.json(CLASH_CONNECTIONS_FIXTURE)),

  connectionsStream.addEventListener('connection', ({ client }) => {
    client.send(JSON.stringify(CLASH_CONNECTIONS_FIXTURE));

    const timer = setInterval(() => {
      client.send(JSON.stringify(CLASH_CONNECTIONS_FIXTURE));
    }, STREAM_INTERVAL);

    client.addEventListener('close', () => {
      clearInterval(timer);
    });
  }),
];
