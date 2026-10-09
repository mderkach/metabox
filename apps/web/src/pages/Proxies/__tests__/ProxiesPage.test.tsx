import { renderWithQuery } from '@test/renderWithQuery';
import { server } from '@test/server';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { PROXY_ENDPOINT } from '@entities/Proxy';
import { CLASH_PROVIDERS_FIXTURE } from '@entities/Proxy/__tests__/Proxy.fixture';
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

  it('заголовок группы вложен в секцию групп, а не стоит с ней на одном уровне', async () => {
    serveProxies();

    renderWithQuery(<ProxiesPage />);

    expect(await screen.findByRole('heading', { level: 3, name: 'proxy' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Группы узлов' })).toBeInTheDocument();
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

  it('объявляет выбор узла живой областью экрана', async () => {
    serveProxies();

    const user = userEvent.setup();

    renderWithQuery(<ProxiesPage />);

    await user.click(await screen.findByRole('button', { name: /proxy Группа|proxy/, pressed: false }));

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'Результат действия' })).toHaveTextContent(
        'Группа us-fallback: выбран узел proxy'
      );
    });
  });

  it('объявляет обновление задержки группы и всех групп', async () => {
    serveProxies();

    const user = userEvent.setup();

    renderWithQuery(<ProxiesPage />);

    await user.click(await screen.findByRole('button', { name: 'Проверить узлы группы us-fallback' }));

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'Результат действия' })).toHaveTextContent(
        'Группа us-fallback: задержка обновлена'
      );
    });

    await user.click(screen.getByRole('button', { name: 'Проверить все' }));

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'Результат действия' })).toHaveTextContent(
        'Задержка всех групп обновлена'
      );
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
    expect(screen.getAllByRole('heading', { name: 'Подписки' })).toHaveLength(1);
  });

  it('дату обновления подписки печатает форматом панели, а в разметке оставляет машинную', async () => {
    serveProxies();

    renderWithQuery(<ProxiesPage />);

    const dates = await screen.findAllByText('10.09.2026');

    expect(dates[0]).toHaveAttribute('dateTime', CLASH_PROVIDERS_FIXTURE.providers['sub-eu'].updatedAt);
  });

  it('обновляет подписку по кнопке и держит кнопку занятой, пока идёт запрос', async () => {
    const updated = vi.fn<() => void>();
    let release = () => {};
    const answered = new Promise<void>((resolve) => {
      release = resolve;
    });

    serveProxies();
    server.use(
      http.put(PROXY_ENDPOINT.provider('sub-eu'), async () => {
        updated();
        await answered;

        return new HttpResponse(null, { status: 204 });
      })
    );

    const user = userEvent.setup();

    renderWithQuery(<ProxiesPage />);

    await user.click(await screen.findByRole('button', { name: 'Обновить подписку sub-eu' }));

    await waitFor(() => {
      expect(updated).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole('button', { name: 'Обновить подписку sub-eu' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Обновить подписку sub-nl' })).toBeEnabled();

    release();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Обновить подписку sub-eu' })).toBeEnabled();
    });
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
