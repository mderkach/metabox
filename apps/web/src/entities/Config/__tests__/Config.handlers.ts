import { http, HttpResponse } from 'msw';

import { CONFIG_ENDPOINT } from '../api/Config.endpoints';
import { CONFIG_FIXTURE } from './Config.fixture';

/** Отступ файла на устройстве: конфиг отдаётся текстом, а не объектом (ADR-0004). */
const JSON_INDENT = 2;

/** Длина sha256 в шестнадцатеричной записи: демон отдаёт её такой же. */
const SUM_LENGTH = 64;

const VERSIONS_FIXTURE = [
  { id: 1, size: 4096, sum: 'a'.repeat(SUM_LENGTH), saved_at: 1_757_500_000 },
  { id: 2, size: 4210, sum: 'b'.repeat(SUM_LENGTH), saved_at: 1_757_600_000 },
];

const CONFIG_TEXT = JSON.stringify(CONFIG_FIXTURE, null, JSON_INDENT);

/**
 * Моки документа и его истории. Сам откат на версию запускает транзакцию и
 * живёт в моках демона, вместе с остальным циклом применения.
 */
export const configHandlers = [
  http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(CONFIG_TEXT)),
  http.get(CONFIG_ENDPOINT.versions(), () =>
    HttpResponse.json({ versions: VERSIONS_FIXTURE, current_sum: VERSIONS_FIXTURE[1].sum })
  ),
  // Номер версии в адресе — шаблон msw, поэтому адрес собирается от базовой
  // ручки: сам номер в константу демона не подставить.
  http.get(`${CONFIG_ENDPOINT.versions()}/:id`, () => HttpResponse.text(CONFIG_TEXT)),
];
