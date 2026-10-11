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
import { NARROW_SCREEN } from '@shared/lib/media';

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

/** `matchMedia` в jsdom нет — подставляем ответ только на запрос узкой ширины. */
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

  it('бар применения плавает под экраном и освобождает под собой место, а не сдвигает экран', async () => {
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

  it('на широком экране разделы в боковой панели, нижней панели нет', async () => {
    serveDaemon();

    renderAppLayout();

    expect(await screen.findByRole('complementary', { name: 'Панель разделов' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ещё' })).not.toBeInTheDocument();
  });

  it('на телефоне боковой панели нет: разделы в нижней панели после содержимого', async () => {
    serveDaemon();
    mockNarrowScreen();

    renderAppLayout();

    const nav = await screen.findByRole('navigation', { name: 'Разделы панели' });

    expect(screen.queryByRole('complementary', { name: 'Панель разделов' })).not.toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'Ещё' })).toBeInTheDocument();
    // Панель в потоке после `main`, а не поверх него: экран под ней не прячется.
    expect(screen.getByRole('main').compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
