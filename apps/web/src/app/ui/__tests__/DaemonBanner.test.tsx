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
const SCHEMA = 'metabox новее панели: часть данных может не отображаться. Обновите страницу.';

/** Its own client instead of `renderWithQuery`: the recovery test needs a repeated status poll. */
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

  // A live region announces what was inserted into it: if it appeared together with
  // the text, a screen reader would miss the first message.
  it('reports that the daemon is not responding in a live region that was there beforehand', async () => {
    serveSilence();

    renderWithQuery(<DaemonBanner />);

    const status = screen.getByRole('status');

    expect(status).toHaveTextContent(/^$/);
    await waitFor(() => {
      expect(status).toHaveTextContent(UNREACHABLE);
    });
  });

  it('tells an unrecognized response from daemon silence', async () => {
    server.use(http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json({ unexpected: true })));

    renderWithQuery(<DaemonBanner />);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(SCHEMA);
    });
  });

  it('the daemon answered: the strip collapses with the same text, hidden from the screen reader', async () => {
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

  // Without animation `transitionend` never fires, and the text would stay.
  it('with animation disabled the text is removed immediately', async () => {
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
