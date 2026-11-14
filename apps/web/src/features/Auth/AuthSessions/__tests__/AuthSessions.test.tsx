import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '@test/server';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTH_ENDPOINT } from '@entities/Auth';
import { createAuthHandlers, OTHER_SESSIONS_FIXTURE } from '@entities/Auth/__tests__/Auth.handlers';
import { showQueryError } from '@shared/api';

import { AuthSessionsSection } from '../ui';

vi.mock('sonner', () => ({
  toast: { error: vi.fn<(text: string) => void>(), success: vi.fn<(text: string) => void>() },
}));

const { toast } = await import('sonner');

const PASSWORD = 'correct horse';

/** The real toast path of the application: errors of mutations go through `meta`. */
function renderSessions(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        showQueryError(mutation.meta, error);
      },
    }),
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

async function findList() {
  return screen.findByRole('list', { name: 'Сессии' });
}

describe('AuthSessionsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists this browser first, without an end button, and the others with one', async () => {
    server.use(...createAuthHandlers({ password: PASSWORD, session: true, others: OTHER_SESSIONS_FIXTURE }));

    renderSessions(<AuthSessionsSection />);
    const rows = within(await findList()).getAllByRole('listitem');

    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText('Этот браузер')).toBeInTheDocument();
    expect(within(rows[0]).queryByRole('button')).not.toBeInTheDocument();
    expect(within(rows[0]).getByText('вход 1 мин назад, активна сейчас')).toBeInTheDocument();
    expect(within(rows[1]).getByText('192.168.1.23')).toBeInTheDocument();
    expect(within(rows[1]).getByText('вход 3 ч назад, активность 5 мин назад')).toBeInTheDocument();
    expect(within(rows[2]).getByText('адрес неизвестен')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Завершить сессию с 192.168.1.23' })).toBeInTheDocument();
  });

  it('ends another session, rereads the list and keeps focus in it', async () => {
    const user = userEvent.setup();
    server.use(...createAuthHandlers({ password: PASSWORD, session: true, others: OTHER_SESSIONS_FIXTURE }));

    renderSessions(<AuthSessionsSection />);
    const list = await findList();
    await user.click(screen.getByRole('button', { name: 'Завершить сессию с 192.168.1.23' }));

    await waitFor(() => expect(screen.queryByText('192.168.1.23')).not.toBeInTheDocument());
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(list).toHaveFocus();
  });

  it('says no other browser is signed in when the list holds only this one', async () => {
    server.use(...createAuthHandlers({ password: PASSWORD, session: true }));

    renderSessions(<AuthSessionsSection />);

    expect(await screen.findByText('В других браузерах вход не выполнен.')).toBeInTheDocument();
  });

  it('reports a failed end with the daemon reason and rereads the list', async () => {
    const user = userEvent.setup();
    let reads = 0;
    // The first matching handler answers: the overrides go before the stateful mock.
    server.use(
      http.get(AUTH_ENDPOINT.sessions(), () => {
        reads += 1;

        return HttpResponse.json({ sessions: OTHER_SESSIONS_FIXTURE });
      }),
      http.delete(`${AUTH_ENDPOINT.sessions()}/:id`, () =>
        HttpResponse.json({ code: 'session_not_found', message: 'session not found' }, { status: 404 })
      ),
      ...createAuthHandlers({ password: PASSWORD, session: true })
    );

    renderSessions(<AuthSessionsSection />);
    await findList();
    await user.click(screen.getByRole('button', { name: 'Завершить сессию с 192.168.1.23' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Не удалось завершить сессию: сессия уже завершена');
    });
    await waitFor(() => {
      expect(reads).toBe(2);
    });
  });

  it('says an unsaved end is still an end, without a failure toast', async () => {
    const user = userEvent.setup();
    server.use(
      http.delete(`${AUTH_ENDPOINT.sessions()}/:id`, () =>
        HttpResponse.json({ code: 'logout_not_saved', message: 'session revocation not saved' }, { status: 500 })
      ),
      ...createAuthHandlers({ password: PASSWORD, session: true, others: OTHER_SESSIONS_FIXTURE })
    );

    renderSessions(<AuthSessionsSection />);
    await findList();
    await user.click(screen.getByRole('button', { name: 'Завершить сессию с 192.168.1.23' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Сессия завершена, но роутер этого не сохранил: после перезапуска демона она может вернуться.'
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows a failure block with a retry when the list is not read', async () => {
    server.use(
      http.get(AUTH_ENDPOINT.sessions(), () =>
        HttpResponse.json({ code: 'internal', message: 'boom' }, { status: 500 })
      ),
      ...createAuthHandlers({ password: PASSWORD, session: true })
    );

    renderSessions(<AuthSessionsSection />);

    expect(await screen.findByText('Не удалось получить список сессий')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  });

  it('is hidden on a panel without a password', async () => {
    server.use(...createAuthHandlers());

    const { container } = renderSessions(<AuthSessionsSection />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
