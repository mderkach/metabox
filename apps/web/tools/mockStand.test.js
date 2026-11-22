import { readFileSync } from 'node:fs';
import path from 'node:path';

import { HttpHandler, matchRequestUrl } from 'msw';
import { describe, expect, it } from 'vitest';

import { createMissingHandlers } from '../src/test/handlers.ts';

const ROUTES_FILE = path.resolve(import.meta.dirname, '../../metaboxd/internal/httpapi/httpapi.go');
const ROUTE = /mux\.HandleFunc\("(GET|POST|PUT|PATCH|DELETE) (\/api\/[^"]*)"/g;
const ORIGIN = 'http://localhost';
/** Guards the regexp: far fewer routes means the route list is no longer read. */
const MIN_ROUTES = 20;

/** Daemon `/api/` routes the panel does not call, with the reason; any other route missing from the stand fails the test. */
const NOT_CALLED_BY_PANEL = new Map();

function daemonRoutes() {
  return [...readFileSync(ROUTES_FILE, 'utf8').matchAll(ROUTE)].map(([, method, route]) => `${method} ${route}`);
}

function stand() {
  return createMissingHandlers()
    .filter((handler) => handler instanceof HttpHandler)
    .map(({ info }) => ({ method: String(info.method).toUpperCase(), pattern: info.path }));
}

describe('mock stand', () => {
  it('reads the daemon route list', () => {
    expect(daemonRoutes().length).toBeGreaterThan(MIN_ROUTES);
  });

  it('serves remote rule set cache states on the stand', async () => {
    const request = new Request(`${ORIGIN}/api/rule-sets/cached`);
    const options = { request, requestId: 'cached-rule-sets', resolutionContext: { baseUrl: ORIGIN } };
    let response;

    for (const handler of createMissingHandlers()) {
      const result = await handler.run(options);

      if (result?.response === undefined) continue;

      response = result.response;
      break;
    }

    const rows = await response?.json();

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ state: 'cached', checked_at: expect.any(Number), size: expect.any(Number) }),
        expect.objectContaining({ state: 'cached', other_address: true }),
        expect.objectContaining({ state: 'memory_only' }),
        expect.objectContaining({ state: 'not_downloaded' }),
        expect.objectContaining({ state: 'unreadable' }),
        expect.objectContaining({ state: 'cache_unavailable' }),
      ])
    );
  });

  it('has a handler for every daemon /api/ route the panel calls', () => {
    const handlers = stand();
    const missing = daemonRoutes()
      .filter((route) => !NOT_CALLED_BY_PANEL.has(route))
      .filter((route) => {
        const [method, template] = route.split(' ');
        const url = new URL(`${ORIGIN}${template.replaceAll(/\{[^}]+\}/g, 'x')}`);

        return !handlers.some(
          (handler) =>
            (handler.method === method || handler.method === 'ALL') &&
            matchRequestUrl(url, handler.pattern, ORIGIN).matches
        );
      });

    expect(missing, 'no handler in createMissingHandlers (apps/web/src/test/handlers.ts) for').toEqual([]);
  });
});
