import type { AxiosRequestConfig } from 'axios';

import { ApiClientInstance } from '@shared/api';

import { AUTH_ENDPOINT } from './Auth.endpoints';
import type { AuthWire, PasswordChangeWire, SessionsWire } from './Auth.schema';

export async function getAuth(config?: AxiosRequestConfig): Promise<AuthWire> {
  return ApiClientInstance.get<AuthWire>(AUTH_ENDPOINT.state(), config);
}

/** The session arrives in an `HttpOnly` cookie: the response has no body, and the token is invisible to the page. */
export async function postLogin(password: string, config?: AxiosRequestConfig): Promise<void> {
  await ApiClientInstance.post(AUTH_ENDPOINT.login(), { password }, config);
}

export async function postLogout(config?: AxiosRequestConfig): Promise<void> {
  await ApiClientInstance.post(AUTH_ENDPOINT.logout(), undefined, config);
}

/** An empty `password` removes the password. A set or change gives the caller a new session in the cookie. */
export async function putPassword(change: PasswordChangeWire, config?: AxiosRequestConfig): Promise<void> {
  await ApiClientInstance.put(AUTH_ENDPOINT.password(), change, config);
}

export async function getSessions(config?: AxiosRequestConfig): Promise<SessionsWire> {
  return ApiClientInstance.get<SessionsWire>(AUTH_ENDPOINT.sessions(), config);
}

/** Ends another session and closes its streams; the daemon refuses the caller's own session with 409. */
export async function deleteSession(id: string, config?: AxiosRequestConfig): Promise<void> {
  await ApiClientInstance.delete(AUTH_ENDPOINT.session(id), config);
}
