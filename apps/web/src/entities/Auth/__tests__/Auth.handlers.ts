import { http, HttpResponse } from 'msw';

import { AUTH_ENDPOINT } from '../api/Auth.endpoints';

interface AuthMockState {
  password: string | null;
  session: boolean;
}

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
 * arguments the panel has no password, as on a fresh install.
 */
export function createAuthHandlers({ password = null }: { password?: string | null } = {}) {
  const state: AuthMockState = { password, session: false };

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
  ];
}
