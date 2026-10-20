import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { finishApplyBarTransition } from '@test/applyBar';
import { server } from '@test/server';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConfigDocumentState } from '@entities/Config';
import { DAEMON_ENDPOINT } from '@entities/Daemon';
import {
  CLASH_CONFIGS_FIXTURE,
  DAEMON_STATUS_FIXTURE,
  SERVICE_RUNNING_FIXTURE,
} from '@entities/Daemon/__tests__/Daemon.fixture';
import { DATAPLANE_ENDPOINT } from '@entities/Dataplane';
import { NARROW_SCREEN } from '@shared/lib/media';

import { AppLayout } from '../AppLayout';

function ScreenStub() {
  return <p>Экран содержимого</p>;
}

/**
 * Its own router per test, as in `test/renderWithRouter.tsx`, but with `AppLayout` at
 * the root: the shell needs a child route so there is something to show in `Outlet`.
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

/** jsdom has no `matchMedia`: answer only the narrow-width query. */
function mockNarrowScreen() {
  vi.stubGlobal('matchMedia', function matchNarrowQuery(media: string) {
    return {
      matches: media === NARROW_SCREEN,
      media,
      addEventListener: vi.fn<() => void>(),
      removeEventListener: vi.fn<() => void>(),
    };
  });
}

describe('AppLayout', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    ConfigDocumentState.getState().reset();
  });

  it('the "skip to content" link is first in tab order and leads to #content', async () => {
    serveDaemon();
    const user = userEvent.setup();

    renderAppLayout();

    const skip = await screen.findByRole('link', { name: 'К содержимому' });

    expect(skip).toHaveAttribute('href', '#content');

    await user.tab();

    expect(skip).toHaveFocus();
  });

  it('main with id "content" wraps the route content', async () => {
    serveDaemon();

    renderAppLayout();

    const main = await screen.findByRole('main');

    expect(main).toHaveAttribute('id', 'content');
    expect(main).toHaveTextContent('Экран содержимого');
  });

  it('shows the daemon unavailability strip above the screen, and the screen stays in place', async () => {
    serveDaemon();
    server.use(http.get(DAEMON_ENDPOINT.status(), () => new HttpResponse(null, { status: 503 })));

    renderAppLayout();

    expect(await screen.findByText(/metabox не отвечает/)).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('Экран содержимого');
  });

  it('the apply bar floats under the screen and frees space beneath it instead of shifting the screen', async () => {
    const barHeight = 64;

    serveDaemon();
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(barHeight);
    ConfigDocumentState.getState().load('{}', `"${'e'.repeat(64)}"`);
    ConfigDocumentState.getState().replace('{ "log": {} }');

    renderAppLayout();

    const bar = await screen.findByRole('region', { name: 'Применение конфига' });
    const main = screen.getByRole('main');

    expect(main.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(main).toHaveStyle({ paddingBottom: `${String(barHeight)}px` });

    act(() => {
      ConfigDocumentState.getState().discard();
    });

    expect(main).toHaveStyle({ paddingBottom: `${String(barHeight)}px` });

    finishApplyBarTransition();

    expect(main).toHaveStyle({ paddingBottom: '0px' });
  });

  it('holds the interception change confirmation on any screen, not only on the devices one', async () => {
    const transaction = { id: 'dp-1', phase: 'awaiting_confirm', window: 60_000_000_000, sha256: 'b'.repeat(64) };

    serveDaemon();
    server.use(
      http.get(DAEMON_ENDPOINT.status(), () =>
        HttpResponse.json({ ...DAEMON_STATUS_FIXTURE, dataplane_transaction: transaction })
      ),
      http.get(DATAPLANE_ENDPOINT.applyState(transaction.id), () => HttpResponse.json(transaction))
    );

    renderAppLayout();

    expect(await screen.findByRole('button', { name: 'Связь есть, оставить' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('Экран содержимого');
  });

  it('on a wide screen the sections are in the sidebar, there is no bottom bar', async () => {
    serveDaemon();

    renderAppLayout();

    expect(await screen.findByRole('complementary', { name: 'Панель разделов' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ещё' })).not.toBeInTheDocument();
  });

  it('on a phone there is no sidebar: the sections are in the bottom bar after the content', async () => {
    serveDaemon();
    mockNarrowScreen();

    renderAppLayout();

    const nav = await screen.findByRole('navigation', { name: 'Разделы панели' });

    expect(screen.queryByRole('complementary', { name: 'Панель разделов' })).not.toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'Ещё' })).toBeInTheDocument();
    // The bar is in flow after `main`, not over it: the screen under it is not hidden.
    expect(screen.getByRole('main').compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
