import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render } from '@testing-library/react';
import type { FunctionComponent } from 'react';

interface ScreenRoute {
  /** Screen path: needed by those who read their address via `useSearch({ from })`. */
  path?: string;
  /** Address parameter parsing — the same as in the real route. */
  validateSearch?: (search: Record<string, unknown>) => Record<string, unknown>;
  /** Address the test starts from: a ready filter goes here. */
  initialEntry?: string;
}

/**
 * Render of a screen inside the router: links to other sections are part of the screen, and without
 * a router they fail. There is one in-memory route — transitions are not tested here,
 * there is a test of the router itself for that.
 */
export function renderWithRouter(Component: FunctionComponent, route: ScreenRoute = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  const path = route.path ?? '/';
  const rootRoute = createRootRoute();
  const screenRoute = createRoute({
    getParentRoute: () => rootRoute,
    path,
    validateSearch: route.validateSearch,
    component: Component,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([screenRoute]),
    history: createMemoryHistory({ initialEntries: [route.initialEntry ?? path] }),
  });

  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    ),
    /** Test router: used to check that the screen wrote state into the address. */
    router,
  };
}
