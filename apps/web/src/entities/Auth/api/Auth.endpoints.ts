/** Panel login addresses. All but the session list answer without a session: the panel reaches them before login. */
export const AUTH_ENDPOINT = {
  state: () => '/api/auth',
  login: () => '/api/auth/login',
  logout: () => '/api/auth/logout',
  password: () => '/api/auth/password',
  sessions: () => '/api/auth/sessions',
  session: (id: string) => `/api/auth/sessions/${encodeURIComponent(id)}`,
} as const;
