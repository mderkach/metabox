import { useEffect, useRef, type ReactNode } from 'react';

import { isLoginRequired, useAuth } from '@entities/Auth';
import { AuthLoginPage } from '@features/Auth/AuthLogin';

import { useSessionWatch } from '../lib/useSessionWatch';

/**
 * Login screen in place of the whole panel. While the daemon has not answered about login, nothing
 * is drawn: the panel would flash and send a burst of requests that get 401. A daemon that does not
 * know the endpoint or does not answer gets the panel as before, with its unavailability banner.
 */
export function AuthGate({
  children,
  onLogin,
}: {
  children: ReactNode;
  /**
   * The panel came back after a login screen that replaced it: its route loaders ran without a
   * session and hold the refusals. Not called after the first login: the panel mounts then and
   * runs its loaders itself.
   */
  onLogin: () => void;
}) {
  useSessionWatch();
  const auth = useAuth();
  const locked = auth.isSuccess && isLoginRequired(auth.data);
  const panelShown = useRef(false);
  const panelLocked = useRef(false);

  useEffect(
    function reloadAfterLogin() {
      if (auth.isPending) {
        return;
      }

      if (locked) {
        panelLocked.current = panelShown.current;

        return;
      }

      panelShown.current = true;

      if (panelLocked.current) {
        panelLocked.current = false;
        onLogin();
      }
    },
    [auth.isPending, locked, onLogin]
  );

  if (auth.isPending) {
    return null;
  }

  if (locked) {
    return <AuthLoginPage />;
  }

  return <>{children}</>;
}
