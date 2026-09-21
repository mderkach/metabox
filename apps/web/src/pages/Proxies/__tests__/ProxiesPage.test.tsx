import { renderWithQuery } from '@test/renderWithQuery';
import { server } from '@test/server';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { PROXY_ENDPOINT } from '@entities/Proxy';
import { proxyHandlers } from '@entities/Proxy/__tests__/Proxy.handlers';

import { ProxiesPage } from '../ui/ProxiesPage';

function serveProxies() {
  server.use(...proxyHandlers);
}

// Экран поднимается целиком вместе с запросами, поэтому тест лежит в `src/test`:
// из слоя `pages` до общей оснастки не дотянуться, не выйдя за границы слоёв.
describe('экран прокси', () => {
  it('показывает группы конфига и не показывает служебные', async () => {
    serveProxies();

    renderWithQuery(<ProxiesPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'proxy' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('heading', { name: 'GLOBAL' })).not.toBeInTheDocument();
  });

  it('переключает узел только в селекторе и шлёт выбор в рантайм', async () => {
    const selected = vi.fn<(body: unknown) => void>();

    serveProxies();
    server.use(
      http.put(PROXY_ENDPOINT.proxy('us-fallback'), async ({ request }) => {
        selected(await request.json());

        return new HttpResponse(null, { status: 204 });
      })
    );

    const user = userEvent.setup();

    renderWithQuery(<ProxiesPage />);

    const node = await screen.findByRole('button', { name: /proxy Группа|proxy/, pressed: false });

    await user.click(node);

    await waitFor(() => {
      expect(selected).toHaveBeenCalledWith({ name: 'proxy' });
    });
  });

  it('узел URL-теста не кликается: выбор там делает sing-box', async () => {
    serveProxies();

    renderWithQuery(<ProxiesPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'proxy' })).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /sub-eu\/eu-xhttp/ })).not.toBeInTheDocument();
  });

  it('показывает подписки, из которых приезжают узлы', async () => {
    serveProxies();

    renderWithQuery(<ProxiesPage />);

    expect(await screen.findByText('sub-eu')).toBeInTheDocument();
  });

  // В фикстуре группа us вложена в us-fallback: проверяется её плитка.
  it('плитка вложенной группы переводит тип, а не показывает его строкой Clash API', async () => {
    serveProxies();

    renderWithQuery(<ProxiesPage />);

    const nested = await screen.findByRole('button', { name: 'us, URL-тест, 609 мс' });

    expect(within(nested).getByText('URL-тест')).toBeInTheDocument();
    expect(within(nested).queryByText('URLTest')).not.toBeInTheDocument();
  });
});
