import { renderWithQuery } from '@test/renderWithQuery';
import { server } from '@test/server';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18next from 'i18next';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';

import { AUTH_ENDPOINT } from '@entities/Auth';

import { AuthLoginPage } from '../ui/AuthLoginPage';

const LOCKED_BODY = { code: 'login_locked', message: 'слишком много неверных паролей' };

function serveLockout(headers: Record<string, string>) {
  server.use(http.post(AUTH_ENDPOINT.login(), () => HttpResponse.json(LOCKED_BODY, { status: 429, headers })));
}

async function submit(field: string, button: string) {
  const user = userEvent.setup();

  await user.type(screen.getByLabelText(field), 'any password');
  await user.click(screen.getByRole('button', { name: button }));
}

afterEach(async () => {
  await i18next.changeLanguage('ru');
});

describe('AuthLoginPage', () => {
  it.each([
    ['ru', 'Пароль', 'Войти', 'Слишком много неверных попыток. Вход закрыт на 2 минуты.'],
    ['en', 'Password', 'Sign in', 'Too many wrong attempts. Sign-in is closed for 2 minutes.'],
  ])('shows the lockout time from Retry-After (%s)', async (language, field, button, text) => {
    await i18next.changeLanguage(language);
    serveLockout({ 'Retry-After': '120' });

    renderWithQuery(<AuthLoginPage />);
    await submit(field, button);

    expect(await screen.findByRole('alert')).toHaveTextContent(text);
  });

  it('rounds a part of a minute up', async () => {
    serveLockout({ 'Retry-After': '61' });

    renderWithQuery(<AuthLoginPage />);
    await submit('Пароль', 'Войти');

    expect(await screen.findByRole('alert')).toHaveTextContent('Вход закрыт на 2 минуты.');
  });

  it('does not name a time the daemon did not send', async () => {
    serveLockout({});

    renderWithQuery(<AuthLoginPage />);
    await submit('Пароль', 'Войти');

    expect(await screen.findByRole('alert')).toHaveTextContent('Вход закрыт на несколько минут.');
  });
});
