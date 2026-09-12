import { http, HttpResponse } from 'msw';

import { CONNECTION_ENDPOINT } from '../api/Connection.endpoints';

/**
 * Соединения приходят топиком единого потока, поэтому здесь остаются только
 * ручки запрос-ответ: закрыть одно соединение и закрыть все.
 */
export const connectionHandlers = [
  http.delete(CONNECTION_ENDPOINT.connections(), () => new HttpResponse(null, { status: 204 })),
  http.delete(CONNECTION_ENDPOINT.connection(':id'), () => new HttpResponse(null, { status: 204 })),
];
