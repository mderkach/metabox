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

/**
 * Рендер экрана внутри роутера: ссылки на другие разделы — часть экрана, и без
 * роутера они падают. Маршрут один и в памяти — переходы здесь не проверяются,
 * для них есть тест самого роутера.
 */
export function renderWithRouter(Component: FunctionComponent) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  const rootRoute = createRootRoute();
  const screenRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: Component });
  const router = createRouter({
    routeTree: rootRoute.addChildren([screenRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });

  return render(
    <QueryClientProvider client={queryClient}>
      {/* Роутер собран под этот тест, а глобальный тип зарегистрирован под
          настоящий: приведение уточняет тип до того, что ждёт провайдер. */}
      {/* oxlint-disable-next-line typescript/no-unsafe-type-assertion -- см. выше */}
      <RouterProvider router={router as never} />
    </QueryClientProvider>
  );
}
