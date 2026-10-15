import { renderWithQuery } from '@test/renderWithQuery';
import { server } from '@test/server';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTH_ENDPOINT } from '@entities/Auth';
import { createAuthHandlers } from '@entities/Auth/__tests__/Auth.handlers';

import { AuthPassword } from '../ui';

vi.mock('sonner', () => ({
  toast: { error: vi.fn<(text: string) => void>(), success: vi.fn<(text: string) => void>() },
}));

const PASSWORD = 'correct horse';

/** The request body the daemon got: the mock keeps the state, the test checks what went out. */
function recordPasswordBodies() {
  const bodies: unknown[] = [];

  server.events.on('request:start', function recordBody({ request }) {
    if (request.method === 'PUT' && new URL(request.url).pathname === AUTH_ENDPOINT.password()) {
      void request
        .clone()
        .json()
        .then((body: unknown) => {
          bodies.push(body);
        });
    }
  });

  return bodies;
}

describe('AuthPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    server.events.removeAllListeners('request:start');
  });

  it('sets the first password without asking for the current one', async () => {
    const user = userEvent.setup();
    server.use(...createAuthHandlers());
    const bodies = recordPasswordBodies();

    renderWithQuery(<AuthPassword />);
    await user.click(await screen.findByRole('button', { name: 'Задать пароль' }));

    expect(screen.queryByLabelText('Текущий пароль')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Новый пароль'), PASSWORD);
    await user.type(screen.getByLabelText('Новый пароль ещё раз'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(bodies).toEqual([{ current: '', password: PASSWORD }]);
    expect(await screen.findByRole('button', { name: 'Пароль' })).toBeInTheDocument();
  });

  it('rejects a short password and a mismatch before sending', async () => {
    const user = userEvent.setup();
    server.use(...createAuthHandlers());
    const bodies = recordPasswordBodies();

    renderWithQuery(<AuthPassword />);
    await user.click(await screen.findByRole('button', { name: 'Задать пароль' }));
    await user.type(screen.getByLabelText('Новый пароль'), 'short');
    await user.type(screen.getByLabelText('Новый пароль ещё раз'), 'other');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText('Не короче 8 символов')).toBeInTheDocument();
    expect(screen.getByText('Пароли не совпадают')).toBeInTheDocument();
    expect(bodies).toEqual([]);
  });

  it('shows a wrong current password in the form', async () => {
    const user = userEvent.setup();
    server.use(...createAuthHandlers({ password: PASSWORD }));

    renderWithQuery(<AuthPassword />);
    await user.click(await screen.findByRole('button', { name: 'Пароль' }));
    await user.type(screen.getByLabelText('Текущий пароль'), 'wrong password');
    await user.type(screen.getByLabelText('Новый пароль'), 'new password');
    await user.type(screen.getByLabelText('Новый пароль ещё раз'), 'new password');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText('Текущий пароль не подошёл')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('removes the password with the current one only', async () => {
    const user = userEvent.setup();
    server.use(...createAuthHandlers({ password: PASSWORD }));
    const bodies = recordPasswordBodies();

    renderWithQuery(<AuthPassword />);
    await user.click(await screen.findByRole('button', { name: 'Пароль' }));
    await user.click(screen.getByRole('button', { name: 'Снять пароль' }));

    expect(await screen.findByText('Введите текущий пароль')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Текущий пароль'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Снять пароль' }));

    expect(await screen.findByRole('button', { name: 'Задать пароль' })).toBeInTheDocument();
    expect(bodies).toEqual([{ current: PASSWORD, password: '' }]);
  });

  it('is hidden while the daemon does not know the login endpoint', async () => {
    let asked = false;

    server.use(
      http.get(AUTH_ENDPOINT.state(), () => {
        asked = true;

        return new Response(null, { status: 404 });
      })
    );

    renderWithQuery(<AuthPassword />);

    await waitFor(() => {
      expect(asked).toBe(true);
    });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
