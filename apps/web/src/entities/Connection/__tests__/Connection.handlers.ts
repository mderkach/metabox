import { http, HttpResponse } from 'msw';

import { API_ENDPOINT } from '@shared/api';

/**
 * Соединения приходят топиком единого потока, поэтому здесь остаются только
 * ручки запрос-ответ: закрыть одно соединение и закрыть все.
 */
export const connectionHandlers = [
  http.delete(API_ENDPOINT.clashConnections(), () => new HttpResponse(null, { status: 204 })),
  http.delete(API_ENDPOINT.clashConnection(':id'), () => new HttpResponse(null, { status: 204 })),
];
