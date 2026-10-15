/** Whether the panel has a password and whether this browser holds a live session. */
export interface AuthState {
  enabled: boolean;
  authenticated: boolean;
}

/** The panel asks for login: the state the shell switches to when the daemon answers 401. */
export const LOGGED_OUT: AuthState = { enabled: true, authenticated: false };

export const LOGGED_IN: AuthState = { enabled: true, authenticated: true };

export const OPEN_PANEL: AuthState = { enabled: false, authenticated: false };

/** The login screen covers the panel only when there is a password and no session. */
export function isLoginRequired(state: AuthState): boolean {
  return state.enabled && !state.authenticated;
}
