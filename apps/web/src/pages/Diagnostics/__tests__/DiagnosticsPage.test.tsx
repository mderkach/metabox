import { renderWithRouter } from '@test/renderWithRouter';
import { server } from '@test/server';
import { screen, within } from '@testing-library/react';
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

    expect(screen.getByRole('status')).toHaveTextContent('Не прошли 3 проверки из 8');

    const redirect = rowOf('Порт redirect (TCP)');

    expect(within(redirect).getByText('не пройдено')).toBeInTheDocument();
    expect(
      within(redirect).getByText('порт никто не слушает. Возможно, ядро остановлено или в конфиге нет нужного входа')
    ).toBeInTheDocument();
    expect(within(redirect).getByText('dial tcp 127.0.0.1:5331: connection refused')).toBeInTheDocument();

    const chains = rowOf('Цепочки nft');
    const missing = within(chains).getByRole('list', { name: 'Отсутствующие цепочки' });

    expect(
      within(missing)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual(['metabox_prerouting', 'metabox_output']);

    const routing = within(rowOf('Маршруты перехвата'));
    expect(routing.getByText('не пройдено')).toBeInTheDocument();
    expect(
      routing.getByText('нет локального маршрута. Из-за этого перехваченный трафик может не доходить до ядра')
    ).toBeInTheDocument();

    const proxy = rowOf('Через прокси');

    expect(within(proxy).getByText('пройдено')).toBeInTheDocument();
    expect(within(proxy).getByText('182 мс')).toBeInTheDocument();

    const direct = rowOf('Напрямую');

    expect(within(direct).getByText('пропущено')).toBeInTheDocument();
    expect(within(direct).getByText('на этой системе проверка не поддерживается')).toBeInTheDocument();
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
