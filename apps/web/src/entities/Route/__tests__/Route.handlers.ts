import { http, HttpResponse } from 'msw';

import { API_ENDPOINT } from '@shared/api';

import { ROUTE_EXPLANATION_FIXTURE } from './Route.fixture';

/**
 * Адрес расшифровывается обратно: идентификатор соединения в константе демона
 * проходит через `encodeURIComponent`, и двоеточие шаблона msw превратилось бы
 * в `%3A`, мимо которого не совпал бы ни один запрос.
 */
const ROUTE_PATTERN = decodeURIComponent(API_ENDPOINT.connectionRoute(':id'));

export const routeHandlers = [
  http.get(ROUTE_PATTERN, ({ params }) =>
    HttpResponse.json({ ...ROUTE_EXPLANATION_FIXTURE, connection_id: String(params.id) })
  ),
];
