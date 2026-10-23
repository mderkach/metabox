import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { server } from '@test/server';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { AUTH_ENDPOINT } from '@entities/Auth';
import { createAuthHandlers } from '@entities/Auth/__tests__/Auth.handlers';
import { ApiClientInstance } from '@shared/api';

import { AuthGate } from '../AuthGate';

const PASSWORD = 'correct horse';
const PROTECTED_PATH = '/api/protected';

/** A screen that reads one endpoint: the gate must react to its 401 the same way as to any other. */
function Panel() {
  const query = useQuery({
    queryKey: ['protected'],
    queryFn: async () => ApiClientInstance.get<{ ok: boolean }>(PROTECTED_PATH),
  });

  if (query.isError) {
    return <p>отказ</p>;
  }

  return <p>{query.isSuccess ? 'панель' : 'загрузка'}</p>;
}

function renderGate(onLogin = vi.fn<() => void>()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  render(
    <QueryClientProvider client={queryClient}>
      <AuthGate onLogin={onLogin}>
        <Panel />
      </AuthGate>
    </QueryClientProvider>
  );

  return onLogin;
}

describe('AuthGate', () => {
  it('shows the panel when it has no password', async () => {
    server.use(
      ...createAuthHandlers(),
      http.get(PROTECTED_PATH, () => HttpResponse.json({ ok: true }))
    );

    renderGate();

    expect(await screen.findByText('панель')).toBeInTheDocument();
    expect(screen.queryByLabelText('Пароль')).not.toBeInTheDocument();
  });

  it('asks for the password and lets in after a right one', async () => {
    const user = userEvent.setup();
    server.use(
      ...createAuthHandlers({ password: PASSWORD }),
      http.get(PROTECTED_PATH, () => HttpResponse.json({ ok: true }))
    );

    const onLogin = renderGate();

    await user.type(await screen.findByLabelText('Пароль'), 'wrong password');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Пароль не подошёл');

    await user.type(screen.getByLabelText('Пароль'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(await screen.findByText('панель')).toBeInTheDocument();
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('reloads the panel when it comes back after a lost session', async () => {
    const user = userEvent.setup();
    let session = true;
    server.use(
      http.get(AUTH_ENDPOINT.state(), () => HttpResponse.json({ enabled: true, authenticated: session })),
      http.post(AUTH_ENDPOINT.login(), () => {
        session = true;

        return new HttpResponse(null, { status: 204 });
      }),
      http.get(PROTECTED_PATH, () =>
        session
          ? HttpResponse.json({ ok: true })
          : HttpResponse.json({ code: 'unauthorized', message: 'нужен вход в панель' }, { status: 401 })
      )
    );

    const onLogin = vi.fn<() => void>();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthGate onLogin={onLogin}>
          <Panel />
        </AuthGate>
      </QueryClientProvider>
    );

    expect(await screen.findByText('панель')).toBeInTheDocument();

    session = false;
    await queryClient.refetchQueries({ queryKey: ['protected'] });

    await user.type(await screen.findByLabelText('Пароль'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(await screen.findByText('панель')).toBeInTheDocument();
    expect(onLogin).toHaveBeenCalledOnce();
  });

  it('switches to the login screen when a request gets 401', async () => {
    server.use(
      ...createAuthHandlers(),
      http.get(PROTECTED_PATH, () =>
        HttpResponse.json({ code: 'unauthorized', message: 'нужен вход в панель' }, { status: 401 })
      )
    );

    renderGate();

    expect(await screen.findByLabelText('Пароль')).toBeInTheDocument();
  });

  it('keeps the panel when the Clash API proxy passes its own 401 through', async () => {
    server.use(
      ...createAuthHandlers(),
      http.get(PROTECTED_PATH, () => HttpResponse.json({ message: 'Unauthorized' }, { status: 401 }))
    );

    renderGate();

    expect(await screen.findByText('отказ')).toBeInTheDocument();
    expect(screen.queryByLabelText('Пароль')).not.toBeInTheDocument();
  });

  it('shows the panel when the daemon does not know the login endpoint', async () => {
    server.use(
      http.get('/api/auth', () =>
        HttpResponse.json({ code: 'not_found', message: 'ручка не найдена' }, { status: 404 })
      ),
      http.get(PROTECTED_PATH, () => HttpResponse.json({ ok: true }))
    );

    renderGate();

    expect(await screen.findByText('панель')).toBeInTheDocument();
  });

  it('runs the route loaders once after the first login', async () => {
    const user = userEvent.setup();
    const loader = vi.fn<() => Promise<null>>(async () => Promise.resolve(null));
    const rootRoute = createRootRoute();
    const panelRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', loader, component: Panel });
    const router = createRouter({
      routeTree: rootRoute.addChildren([panelRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

    server.use(
      ...createAuthHandlers({ password: PASSWORD }),
      http.get(PROTECTED_PATH, () => HttpResponse.json({ ok: true }))
    );

    render(
      <QueryClientProvider client={queryClient}>
        <AuthGate
          onLogin={() => {
            void router.invalidate();
          }}
        >
          <RouterProvider router={router} />
        </AuthGate>
      </QueryClientProvider>
    );

    await user.type(await screen.findByLabelText('Пароль'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(await screen.findByText('панель')).toBeInTheDocument();
    await waitFor(() => {
      expect(router.state.status).toBe('idle');
    });

    expect(loader).toHaveBeenCalledOnce();
  });
});
