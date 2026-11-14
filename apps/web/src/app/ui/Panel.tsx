import { RouterProvider } from '@tanstack/react-router';

import { Router } from '../router/Router';

/** The panel behind the login gate: loaded as a separate chunk, so the login screen does not fetch the router and its screens. */
export function Panel() {
  return <RouterProvider router={Router} />;
}
