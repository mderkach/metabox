import { http, HttpResponse } from 'msw';

import { CONFIG_ENDPOINT } from '../api/Config.endpoints';
import { CONFIG_FIXTURE } from './Config.fixture';

/** Indent of the file on the device: the config is served as text, not as an object. */
const JSON_INDENT = 2;

/** Length of sha256 in hexadecimal form: the daemon serves it the same way. */
const SUM_LENGTH = 64;

const VERSIONS_FIXTURE = [
  { id: 1, size: 4096, sum: 'a'.repeat(SUM_LENGTH), saved_at: 1_757_500_000 },
  { id: 2, size: 4210, sum: 'b'.repeat(SUM_LENGTH), saved_at: 1_757_600_000 },
];

const CONFIG_TEXT = JSON.stringify(CONFIG_FIXTURE, null, JSON_INDENT);

/** The daemon serves the file fingerprint in `ETag`, in quotes; the panel returns it in `If-Match`. */
const CONFIG_ETAG = `"${'c'.repeat(SUM_LENGTH)}"`;

/**
 * Mocks of the document and its history. The rollback to a version itself starts a transaction and
 * lives in the daemon mocks, together with the rest of the apply cycle.
 */
export const configHandlers = [
  http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(CONFIG_TEXT, { headers: { ETag: CONFIG_ETAG } })),
  http.get(CONFIG_ENDPOINT.versions(), () =>
    HttpResponse.json({ versions: VERSIONS_FIXTURE, current_sum: VERSIONS_FIXTURE[1].sum })
  ),
  // The version number in the address is an msw template, so the address is built from the base
  // handler: the number itself cannot be substituted into the daemon constant.
  http.get(`${CONFIG_ENDPOINT.versions()}/:id`, () => HttpResponse.text(CONFIG_TEXT)),
];
