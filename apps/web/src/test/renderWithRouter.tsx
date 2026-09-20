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
  /** Путь экрана: нужен тем, кто читает свой адрес через `useSearch({ from })`. */
  path?: string;
  /** Разбор параметров адреса — тот же, что у настоящего маршрута. */
  validateSearch?: (search: Record<string, unknown>) => Record<string, unknown>;
  /** Адрес, с которого начинается тест: сюда кладётся готовый отбор. */
  initialEntry?: string;
}

/**
 * Рендер экрана внутри роутера: ссылки на другие разделы — часть экрана, и без
 * роутера они падают. Маршрут один и в памяти — переходы здесь не проверяются,
 * для них есть тест самого роутера.
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
    /** Роутер теста: по нему проверяют, что экран записал состояние в адрес. */
    router,
  };
}
