import { renderWithRouter } from '@test/renderWithRouter';
import { selectOption } from '@test/selectOption';
import { server } from '@test/server';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { DIAG_ENDPOINT } from '@entities/Diag';
import { createDiagHandlers } from '@entities/Diag/__tests__/Diag.handlers';
import { proxyHandlers } from '@entities/Proxy/__tests__/Proxy.handlers';

import { DiagnosticsPage } from '../ui/DiagnosticsPage';

function renderScreen() {
  return renderWithRouter(DiagnosticsPage, { path: '/diagnostics' });
}

function rowOf(name: string): HTMLElement {
  const row = screen.getAllByRole('row').find((item) => within(item).queryByText(name) !== null);

  if (row === undefined) {
    throw new Error(`Строки «${name}» нет в отчёте`);
  }

  return row;
}

describe('diagnostics screen', () => {
  it('without pressing "Проверить" does not go to the daemon', async () => {
    const report = vi.fn<() => void>();

    server.use(
      ...proxyHandlers,
      http.get(DIAG_ENDPOINT.report(), () => {
        report();

        return HttpResponse.json({ checks: [] });
      })
    );

    renderScreen();

    expect(await screen.findByText('Проверка не запускалась')).toBeInTheDocument();
    expect(report).not.toHaveBeenCalled();
  });

  it('shows the check result by color and icon, the reason by code, chains and latency', async () => {
    const user = userEvent.setup();

    server.use(...proxyHandlers, ...createDiagHandlers());

    renderScreen();

    await user.click(await screen.findByRole('button', { name: 'Проверить' }));

    await screen.findByRole('table', { name: 'Проверки обвязки' });

    const redirect = rowOf('Порт redirect (TCP)');

    expect(within(redirect).getByText('отказ')).toBeInTheDocument();
    expect(
      within(redirect).getByText('порт никто не слушает: sing-box остановлен или в конфиге нет такого inbound')
    ).toBeInTheDocument();
    expect(within(redirect).getByText('dial tcp 127.0.0.1:5331: connection refused')).toBeInTheDocument();

    const chains = rowOf('Цепочки nft');
    const missing = within(chains).getByRole('list', { name: 'Отсутствующие цепочки' });

    expect(
      within(missing)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual(['metabox_prerouting', 'metabox_output']);

    const proxy = rowOf('Выход через узел');

    expect(within(proxy).getByText('в порядке')).toBeInTheDocument();
    expect(within(proxy).getByText('182 мс')).toBeInTheDocument();

    const direct = rowOf('Прямой выход');

    expect(within(direct).getByText('пропущено')).toBeInTheDocument();
    expect(within(direct).getByText('на этой системе проверка не поддерживается')).toBeInTheDocument();
  });

  it('checks the outbound through the selected node, by default through the first group', async () => {
    const user = userEvent.setup();
    const targets: (string | null)[] = [];

    server.use(
      ...proxyHandlers,
      http.get(DIAG_ENDPOINT.report(), ({ request }) => {
        targets.push(new URL(request.url).searchParams.get('proxy'));

        return HttpResponse.json({ checks: [{ name: 'proxy', status: 'ok', delay_ms: 90 }] });
      })
    );

    renderScreen();

    const run = await screen.findByRole('button', { name: 'Проверить' });
    const select = screen.getByRole('combobox', { name: 'Узел для проверки выхода' });

    await waitFor(() => {
      expect(select).toHaveTextContent('us-fallback');
    });
    await user.click(run);
    await screen.findByText('90 мс');

    await selectOption(user, select, 'не проверять выход через узел');
    await user.click(run);

    await waitFor(() => {
      expect(targets).toEqual(['us-fallback', null]);
    });
  });

  it('a daemon failure shows the reason, not an empty report', async () => {
    const user = userEvent.setup();

    server.use(
      ...proxyHandlers,
      http.get(DIAG_ENDPOINT.report(), () =>
        HttpResponse.json({ code: 'internal', message: 'diag: boom' }, { status: 500 })
      )
    );

    renderScreen();

    await user.click(await screen.findByRole('button', { name: 'Проверить' }));

    expect(await screen.findByText('Не удалось провести диагностику')).toBeInTheDocument();
    expect(screen.getByText('внутренняя ошибка демона')).toBeInTheDocument();
  });
});
