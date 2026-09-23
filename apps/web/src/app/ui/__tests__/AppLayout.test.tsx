import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { server } from '@test/server';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { DAEMON_ENDPOINT } from '@entities/Daemon';
import {
  CLASH_CONFIGS_FIXTURE,
  DAEMON_STATUS_FIXTURE,
  SERVICE_RUNNING_FIXTURE,
} from '@entities/Daemon/__tests__/Daemon.fixture';

import { AppLayout } from '../AppLayout';

function ScreenStub() {
  return <p>Экран содержимого</p>;
}

/**
 * Свой роутер под тест, как в `test/renderWithRouter.tsx`, но с `AppLayout` в
 * корне: оболочке нужен дочерний маршрут, чтобы было что показать в `Outlet`.
 */
function renderAppLayout() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const rootRoute = createRootRoute({ component: AppLayout });
  const screenRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: ScreenStub });
  const router = createRouter({
    routeTree: rootRoute.addChildren([screenRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

function serveDaemon() {
  server.use(
    http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json(DAEMON_STATUS_FIXTURE)),
    http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(SERVICE_RUNNING_FIXTURE)),
    http.get(DAEMON_ENDPOINT.clashConfigs(), () => HttpResponse.json(CLASH_CONFIGS_FIXTURE))
  );
}

describe('AppLayout', () => {
  it('ссылка «к содержимому» первая в порядке табуляции и ведёт на #content', async () => {
    serveDaemon();
    const user = userEvent.setup();

    renderAppLayout();

    const skip = await screen.findByRole('link', { name: 'К содержимому' });

    expect(skip).toHaveAttribute('href', '#content');

    await user.tab();

    expect(skip).toHaveFocus();
  });

  it('main с id «content» оборачивает содержимое маршрута', async () => {
    serveDaemon();

    renderAppLayout();

    const main = await screen.findByRole('main');

    expect(main).toHaveAttribute('id', 'content');
    expect(main).toHaveTextContent('Экран содержимого');
  });

  it('показывает полосу недоступности демона над экраном, а экран остаётся на месте', async () => {
    serveDaemon();
    server.use(http.get(DAEMON_ENDPOINT.status(), () => new HttpResponse(null, { status: 503 })));

    renderAppLayout();

    expect(await screen.findByText(/metabox не отвечает/)).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('Экран содержимого');
  });
});
