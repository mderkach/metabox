import { http, HttpResponse } from 'msw';

import { AUTH_ENDPOINT } from '../api/Auth.endpoints';
import type { SessionWire } from '../api/Auth.schema';

interface AuthMockState {
  password: string | null;
  session: boolean;
  others: SessionWire[];
}

export const CURRENT_SESSION_ID = 'current';

/** Two browsers signed in besides the caller: a phone on the LAN and a session saved before addresses were kept. */
export const OTHER_SESSIONS_FIXTURE: SessionWire[] = [
  { id: 'a1b2c3d4e5f60718', addr: '192.168.1.23', age_seconds: 10_800, idle_seconds: 300, current: false },
  { id: 'f0e1d2c3b4a59687', age_seconds: 172_800, idle_seconds: 18_000, current: false },
];

const UNAUTHORIZED = { code: 'unauthorized', message: 'sign-in required' };

function field(body: unknown, name: string): string {
  if (typeof body !== 'object' || body === null || !(name in body)) {
    return '';
  }

  const value: unknown = Reflect.get(body, name);

  return typeof value === 'string' ? value : '';
}

/**
 * Login works as in the daemon, with the session as a flag instead of a cookie: jsdom and the
 * service worker keep cookies differently, and the panel never reads the cookie anyway. Without
 * arguments the panel has no password, as on a fresh install; `session` starts signed in.
 *
 * `others` are the sessions of other browsers. Unlike the daemon, a password change keeps them:
 * a mock stand has no second browser to sign in again, and the list would stay a single row.
 */
export function createAuthHandlers({
  password = null,
  session = false,
  others = [],
}: { password?: string | null; session?: boolean; others?: SessionWire[] } = {}) {
  const state: AuthMockState = { password, session, others: [...others] };

  return [
    http.get(AUTH_ENDPOINT.state(), () =>
      HttpResponse.json({ enabled: state.password !== null, authenticated: state.password !== null && state.session })
    ),
    http.post(AUTH_ENDPOINT.login(), async ({ request }) => {
      if (state.password === null) {
        return HttpResponse.json({ code: 'auth_disabled', message: 'panel password is not set' }, { status: 409 });
      }

      if (field(await request.json(), 'password') !== state.password) {
        return HttpResponse.json({ code: 'password_wrong', message: 'wrong password' }, { status: 403 });
      }

      state.session = true;

      return new HttpResponse(null, { status: 204 });
    }),
    http.post(AUTH_ENDPOINT.logout(), () => {
      state.session = false;

      return new HttpResponse(null, { status: 204 });
    }),
    http.put(AUTH_ENDPOINT.password(), async ({ request }) => {
      const body: unknown = await request.json();

      if (state.password !== null && field(body, 'current') !== state.password) {
        return HttpResponse.json({ code: 'password_wrong', message: 'wrong password' }, { status: 403 });
      }

      const next = field(body, 'password');

      state.password = next === '' ? null : next;
      state.session = next !== '';

      return new HttpResponse(null, { status: 204 });
    }),
    http.get(AUTH_ENDPOINT.sessions(), () => {
      if (state.password === null) {
        return HttpResponse.json({ sessions: [] });
      }

      if (!state.session) {
        return HttpResponse.json(UNAUTHORIZED, { status: 401 });
      }

      const current: SessionWire = {
        id: CURRENT_SESSION_ID,
        addr: '192.168.1.10',
        age_seconds: 60,
        idle_seconds: 0,
        current: true,
      };

      return HttpResponse.json({ sessions: [current, ...state.others] });
    }),
    http.delete(`${AUTH_ENDPOINT.sessions()}/:id`, ({ params }) => {
      if (state.password !== null && !state.session) {
        return HttpResponse.json(UNAUTHORIZED, { status: 401 });
      }

      if (params.id === CURRENT_SESSION_ID) {
        return HttpResponse.json(
          { code: 'session_current', message: 'use sign-out for the current session' },
          { status: 409 }
        );
      }

      const left = state.others.filter((session) => session.id !== params.id);

      if (left.length === state.others.length) {
        return HttpResponse.json({ code: 'session_not_found', message: 'session not found' }, { status: 404 });
      }

      state.others = left;

      return new HttpResponse(null, { status: 204 });
    }),
  ];
}
