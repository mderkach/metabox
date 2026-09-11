import { http, HttpResponse } from 'msw';

import { API_ENDPOINT } from '@shared/api';

import { CONFIG_FIXTURE } from './Config.fixture';

/** Отступ файла на устройстве: конфиг отдаётся текстом, а не объектом (ADR-0004). */
const JSON_INDENT = 2;

export const configHandlers = [
  http.get(API_ENDPOINT.config(), () => HttpResponse.text(JSON.stringify(CONFIG_FIXTURE, null, JSON_INDENT))),
];
