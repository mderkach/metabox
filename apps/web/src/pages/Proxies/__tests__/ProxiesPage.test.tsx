import { renderWithQuery } from '@test/renderWithQuery';
import { server } from '@test/server';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PROXY_ENDPOINT } from '@entities/Proxy';
import { CLASH_PROVIDERS_FIXTURE } from '@entities/Proxy/__tests__/Proxy.fixture';
import { proxyHandlers } from '@entities/Proxy/__tests__/Proxy.handlers';
import { formatDateTime } from '@shared/lib/format';

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

  // Без названного порога 290 и 310 мс разного цвета выглядят случайностью.
  it('называет пороги тона задержки легендой над группами', async () => {
    serveProxies();

    renderWithQuery(<ProxiesPage />);

    const legend = within(await screen.findByRole('list', { name: 'Цвет задержки' }));

    expect(legend.getByText('до 300 мс')).toBeInTheDocument();
    expect(legend.getByText('дольше 300 мс')).toBeInTheDocument();
    expect(legend.getByText('не ответил')).toBeInTheDocument();
  });

  // Выбранный узел несёт кромку и галочку; отдельная строка «сейчас: X»
  // повторяла бы их третьим признаком.
  it('не дублирует выбранный узел строкой над плитками', async () => {
    serveProxies();

    renderWithQuery(<ProxiesPage />);

    expect(await screen.findByRole('heading', { name: 'proxy' })).toBeInTheDocument();
    expect(screen.queryByText('сейчас:')).not.toBeInTheDocument();
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

  describe('время обновления подписки', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('подписывает «обновлена N назад», полную дату кладёт в title, а машинную — в dateTime', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-10T15:30:00Z') });
      serveProxies();

      renderWithQuery(<ProxiesPage />);

      const label = await screen.findAllByText('обновлена 3 ч назад');

      expect(label[0]).toHaveAttribute('dateTime', CLASH_PROVIDERS_FIXTURE.providers['sub-eu'].updatedAt);
      expect(label[0]).toHaveAttribute('title', formatDateTime(new Date('2026-09-10T12:27:02Z')));
    });

    it('до минуты после обновления пишет «только что», а не секунды', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-10T12:27:30Z') });
      serveProxies();

      renderWithQuery(<ProxiesPage />);

      expect(await screen.findAllByText('обновлена только что')).not.toHaveLength(0);
    });

    it('нулевую дату рантайма показывает как «ещё не обновлялась»', async () => {
      serveProxies();
      server.use(
        http.get(PROXY_ENDPOINT.providers(), () =>
          HttpResponse.json({
            providers: {
              fresh: {
                ...CLASH_PROVIDERS_FIXTURE.providers['sub-eu'],
                name: 'fresh',
                updatedAt: '0001-01-01T00:00:00Z',
              },
            },
          })
        )
      );

      renderWithQuery(<ProxiesPage />);

      expect(await screen.findByText('ещё не обновлялась')).toBeInTheDocument();
      expect(screen.queryByText(/назад/)).not.toBeInTheDocument();
    });

    it('показывает трафик и срок подписки, когда подписка их сообщила', async () => {
      serveProxies();

      renderWithQuery(<ProxiesPage />);

      expect(await screen.findByText('873.7 МБ из 100.0 ГБ')).toBeInTheDocument();
      expect(screen.getByText('до 01.12.2026')).toBeInTheDocument();
    });

    it('перечитывает время после успешного обновления подписки', async () => {
      let updatedAt = '2026-09-10T12:27:02Z';

      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-10T15:30:00Z') });
      serveProxies();
      server.use(
        http.get(PROXY_ENDPOINT.providers(), () =>
          HttpResponse.json({
            providers: { 'sub-eu': { ...CLASH_PROVIDERS_FIXTURE.providers['sub-eu'], updatedAt } },
          })
        ),
        http.put(PROXY_ENDPOINT.provider('sub-eu'), () => {
          updatedAt = '2026-09-10T15:29:50Z';

          return new HttpResponse(null, { status: 204 });
        })
      );

      const user = userEvent.setup({ advanceTimers: () => {} });

      renderWithQuery(<ProxiesPage />);

      expect(await screen.findByText('обновлена 3 ч назад')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Обновить подписку sub-eu' }));

      expect(await screen.findByText('обновлена только что')).toBeInTheDocument();
    });
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
