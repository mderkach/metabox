import { RouterProvider } from '@tanstack/react-router';
import { renderWithQuery } from '@test/renderWithQuery';
import { server } from '@test/server';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { API_ENDPOINT } from '@shared/api';

import { Router } from '../Router';

function serveDaemon() {
  server.use(
    http.get(API_ENDPOINT.status(), () =>
      HttpResponse.json({ version: 'dev', singbox_version: '1.14.0-extended-2.7.1' })
    ),
    http.get(API_ENDPOINT.config(), () => HttpResponse.text(MINIMAL_CONFIG))
  );
}

/** Экрану достаточно разбираемого конфига: список правил здесь не проверяется. */
const MINIMAL_CONFIG = JSON.stringify({ route: { rules: [{ outbound: 'direct' }] } }, null, 2);

describe('маршруты панели', () => {
  it('открывает конфигурацию с корня: пустого экрана на / нет', async () => {
    serveDaemon();

    renderWithQuery(<RouterProvider router={Router} />);

    // Заголовок экрана повторяет название пункта меню, поэтому опознаём экран
    // по пути к файлу — он есть только на самой странице.
    await waitFor(() => {
      expect(screen.getByText('/etc/sing-box/config.json')).toBeInTheDocument();
    });
    expect(Router.state.location.pathname).toBe('/config');
  });

  it('в навигации кликается только сделанный раздел', async () => {
    serveDaemon();

    renderWithQuery(<RouterProvider router={Router} />);

    const link = await screen.findByRole('link', { name: 'Конфигурация' });

    expect(link).toHaveAttribute('href', '/config');
    expect(screen.getByTitle('Каталог rule-set — раздел ещё не сделан')).toHaveAttribute('aria-disabled', 'true');
  });
});
