import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderWithQuery } from '@test/renderWithQuery';
import { server } from '@test/server';
import { act, fireEvent, isInaccessible, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DAEMON_ENDPOINT } from '@entities/Daemon';
import { DAEMON_STATUS_FIXTURE } from '@entities/Daemon/__tests__/Daemon.fixture';

import { DaemonBanner } from '../DaemonBanner';

const UNREACHABLE = 'metabox не отвечает. Панель показывает последние загруженные данные, применять изменения нельзя.';
const SCHEMA = 'Панель не разобрала ответ metabox: версия демона новее панели. Данные на экранах могут быть неполными.';

/** Свой клиент, а не `renderWithQuery`: тесту восстановления нужен повторный опрос статуса. */
function renderBanner() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  render(
    <QueryClientProvider client={queryClient}>
      <DaemonBanner />
    </QueryClientProvider>
  );

  return async function recover() {
    server.use(http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json(DAEMON_STATUS_FIXTURE)));
    await act(async () => queryClient.refetchQueries());
  };
}

function serveSilence() {
  server.use(http.get(DAEMON_ENDPOINT.status(), () => new HttpResponse(null, { status: 503 })));
}

describe('DaemonBanner', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Живая область объявляет то, что в неё вставили: появись она вместе с
  // текстом, первое сообщение скринридер пропустил бы.
  it('сообщает, что демон не отвечает, в живой области, которая стояла заранее', async () => {
    serveSilence();

    renderWithQuery(<DaemonBanner />);

    const status = screen.getByRole('status');

    expect(status).toHaveTextContent(/^$/);
    await waitFor(() => {
      expect(status).toHaveTextContent(UNREACHABLE);
    });
  });

  it('отличает непонятый ответ от молчания демона', async () => {
    server.use(http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json({ unexpected: true })));

    renderWithQuery(<DaemonBanner />);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(SCHEMA);
    });
  });

  it('демон ответил — полоса сворачивается с прежним текстом, скрытым от скринридера', async () => {
    serveSilence();
    const recover = renderBanner();

    expect(isInaccessible(await screen.findByText(UNREACHABLE))).toBe(false);

    await recover();

    await waitFor(() => {
      expect(isInaccessible(screen.getByText(UNREACHABLE))).toBe(true);
    });
    expect(screen.queryByText(SCHEMA)).not.toBeInTheDocument();

    fireEvent.transitionEnd(screen.getByRole('status'));

    expect(screen.getByRole('status')).toHaveTextContent(/^$/);
  });

  // Без анимации `transitionend` не приходит, и текст остался бы висеть.
  it('при отключённой анимации текст снимается сразу', async () => {
    vi.stubGlobal('matchMedia', function matchReducedMotion(media: string) {
      return {
        matches: media === '(prefers-reduced-motion: reduce)',
        media,
        addEventListener: vi.fn<() => void>(),
        removeEventListener: vi.fn<() => void>(),
      };
    });
    serveSilence();
    const recover = renderBanner();

    await screen.findByText(UNREACHABLE);
    await recover();

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/^$/);
    });
  });
});
