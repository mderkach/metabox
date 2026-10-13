import { http, HttpResponse } from 'msw';

import { CONNECTION_ENDPOINT } from '../api/Connection.endpoints';

/**
 * Connections arrive as a topic of the single stream, so only request-response
 * handlers remain here: close one connection and close all.
 */
export const connectionHandlers = [
  http.delete(CONNECTION_ENDPOINT.connections(), () => new HttpResponse(null, { status: 204 })),
  http.delete(CONNECTION_ENDPOINT.connection(':id'), () => new HttpResponse(null, { status: 204 })),
];
