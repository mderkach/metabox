/** Panel login addresses. They answer without a session: the panel reaches them before login. */
export const AUTH_ENDPOINT = {
  state: () => '/api/auth',
  login: () => '/api/auth/login',
  logout: () => '/api/auth/logout',
  password: () => '/api/auth/password',
} as const;
